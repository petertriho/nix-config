import assert from "node:assert/strict";
import test from "node:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import subagentDone, {
	findLatestAssistantError,
	parseDeniedTools,
	renderSubagentToolsWidget,
	shouldAutoExitOnAgentEnd,
	shouldMarkUserTookOver,
} from "./subagent-done.ts";
import type { UiTheme } from "./ui.ts";

function markerTheme(marker: string): UiTheme {
	const mark = (kind: string, token: string, text: string) =>
		`\x1b]9;${marker}:${kind}:${token}\x07${text}\x1b]9;end\x07`;
	return {
		fg: (token, text) => mark("fg", token, text),
		bg: (token, text) => mark("bg", token, text),
		bold: (text) => mark("style", "bold", text),
	} as UiTheme;
}

test("shouldMarkUserTookOver ignores input before the first agent run", () => {
	assert.equal(shouldMarkUserTookOver(false), false);
	assert.equal(shouldMarkUserTookOver(true), true);
});

test("shouldAutoExitOnAgentEnd exits after normal completion regardless of takeover", () => {
	const messages = [{ role: "assistant", stopReason: "stop" }];
	assert.equal(shouldAutoExitOnAgentEnd(false, messages), true);
	assert.equal(shouldAutoExitOnAgentEnd(true, messages), true);
});

test("shouldAutoExitOnAgentEnd stays open after an aborted run", () => {
	assert.equal(shouldAutoExitOnAgentEnd(false, [{ role: "assistant", stopReason: "aborted" }]), false);
});

test("shouldAutoExitOnAgentEnd exits on stopReason=error and with no messages", () => {
	assert.equal(
		shouldAutoExitOnAgentEnd(false, [{ role: "assistant", stopReason: "error", errorMessage: "529 overloaded" }]),
		true,
	);
	assert.equal(shouldAutoExitOnAgentEnd(false, undefined), true);
});

test("findLatestAssistantError returns the error info from the latest assistant message", () => {
	const messages = [
		{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "ok" }] },
		{ role: "toolResult", content: [] },
		{ role: "assistant", stopReason: "error", errorMessage: "Anthropic 529 Overloaded" },
	];
	assert.deepEqual(findLatestAssistantError(messages), {
		errorMessage: "Anthropic 529 Overloaded",
		stopReason: "error",
	});
});

test("findLatestAssistantError returns null for normal or aborted latest turns", () => {
	assert.equal(
		findLatestAssistantError([
			{ role: "assistant", stopReason: "error", errorMessage: "old failure" },
			{ role: "user", content: [] },
			{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] },
		]),
		null,
	);
	assert.equal(findLatestAssistantError([{ role: "assistant", stopReason: "aborted" }]), null);
	assert.equal(findLatestAssistantError(undefined), null);
	assert.equal(findLatestAssistantError([]), null);
});

test("findLatestAssistantError falls back to a placeholder message", () => {
	const info = findLatestAssistantError([{ role: "assistant", stopReason: "error" }]);
	assert.ok(info);
	assert.equal(info.stopReason, "error");
	assert.match(info.errorMessage, /stopReason=error/);
});

test("parseDeniedTools splits, trims, and drops empty entries", () => {
	assert.deepEqual(parseDeniedTools("subagent, subagent_resume ,,"), ["subagent", "subagent_resume"]);
	assert.deepEqual(parseDeniedTools(undefined), []);
	assert.deepEqual(parseDeniedTools(""), []);
});

test("child tools widget renders collapsed policy and hint semantics without a background", () => {
	const theme = markerTheme("child");
	const noDenied = renderSubagentToolsWidget(theme, {
		identity: "Scout",
		toolNames: ["read", "bash"],
		denied: [],
		expanded: false,
	}, 80);
	const noDeniedOutput = noDenied.join("\n");
	assert.match(noDeniedOutput, /child:fg:accent/);
	assert.match(noDeniedOutput, /child:fg:muted/);
	assert.match(noDeniedOutput, /child:fg:dim/);
	assert.match(stripTerminalSequences(noDeniedOutput), /Scout.*2 available/);
	assert.match(stripTerminalSequences(noDeniedOutput), /Ctrl\+Shift\+J expand/);
	assert.doesNotMatch(noDeniedOutput, /child:bg:/);

	const denied = renderSubagentToolsWidget(theme, {
		identity: "Worker",
		toolNames: ["read"],
		denied: ["subagent"],
		expanded: false,
	}, 80).join("\n");
	assert.match(denied, /child:fg:warning/);
	assert.match(stripTerminalSequences(denied), /1 denied/);
	assert.doesNotMatch(denied, /child:fg:error|child:bg:/);
});

test("expanded child tools widget preserves complete sanitized tool lists", () => {
	const theme = markerTheme("expanded");
	const longTool = `unicode-${"漢".repeat(24)}-👩🏽‍💻`;
	const lines = renderSubagentToolsWidget(theme, {
		identity: "\x1b[31mWorker\x1b[0m\x1b]8;;https://evil\x07link\x1b]8;;\x07\u009b",
		toolNames: ["read\u009d", "\x1b[2Abash\u0090", longTool],
		denied: ["subagent\u0085", "\x1b[31msubagent_resume\x1b[0m\u009c"],
		expanded: true,
	}, 24);
	const output = lines.join("\n");
	const plain = stripTerminalSequences(output);
	assert.match(plain, /Workerlink/);
	assert.match(plain, /available:/);
	assert.match(plain, /denied:/);
	assert.match(
		plain.replace(/[\s│╭╮╰╯─]/g, ""),
		new RegExp(longTool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
	);
	for (const tool of ["read", "bash", "subagent", "subagent_resume"]) {
		assert.ok(plain.includes(tool), tool);
	}
	assert.doesNotMatch(output, /\x1b\[31m|\x1b\[2A|https:\/\/evil/);
	assert.doesNotMatch(output, /[\u0080-\u009f]/u);
	assert.match(output, /expanded:fg:warning/);
	assert.doesNotMatch(output, /expanded:fg:error|expanded:bg:/);
});

test("child tools widget fits all responsive widths and styles live from the theme", () => {
	const data = {
		identity: "Scout 👩🏽‍💻",
		toolNames: ["read", "bash", "symbol_search"],
		denied: ["subagent"],
		expanded: true,
	};
	for (const width of [0, 1, 2, 16, 24, 40, 80]) {
		for (const line of renderSubagentToolsWidget(markerTheme("width"), data, width)) {
			assert.ok(visibleWidth(line) <= width, `${width}: ${JSON.stringify(line)}`);
		}
	}

	const first = renderSubagentToolsWidget(markerTheme("first"), data, 80).join("\n");
	const second = renderSubagentToolsWidget(markerTheme("second"), data, 80).join("\n");
	assert.match(first, /first:fg:accent/);
	assert.doesNotMatch(first, /second:/);
	assert.match(second, /second:fg:accent/);
	assert.doesNotMatch(second, /first:/);
});

test("child extension preserves widget placement and Ctrl+Shift+J expansion", () => {
	const handlers = new Map<string, Function>();
	const shortcuts = new Map<string, any>();
	const tools: any[] = [];
	let widget: { factory: Function; options: any } | undefined;
	const api = {
		on(name: string, handler: Function) {
			handlers.set(name, handler);
		},
		getAllTools() {
			return [{ name: "read" }, { name: "bash" }];
		},
		registerShortcut(name: string, shortcut: any) {
			shortcuts.set(name, shortcut);
		},
		registerTool(tool: any) {
			tools.push(tool);
		},
	};
	const ctx = {
		ui: {
			setWidget(_id: string, factory: Function, options: any) {
				widget = { factory, options };
			},
		},
	};
	const saved = {
		name: process.env.PI_SUBAGENT_NAME,
		agent: process.env.PI_SUBAGENT_AGENT,
		denied: process.env.PI_DENY_TOOLS,
	};
	process.env.PI_SUBAGENT_NAME = "Worker";
	process.env.PI_SUBAGENT_AGENT = "scout";
	process.env.PI_DENY_TOOLS = "subagent";
	try {
		subagentDone(api as any);
		handlers.get("session_start")?.({}, ctx);
		assert.equal(widget?.options.placement, "aboveEditor");
		assert.deepEqual(tools.map((tool) => tool.name).sort(), ["caller_ping", "subagent_done"]);
		const collapsed = widget?.factory(null, markerTheme("runtime")).render(80).join("\n");
		assert.match(stripTerminalSequences(collapsed ?? ""), /Ctrl\+Shift\+J expand/);

		const shortcut = shortcuts.get("ctrl+shift+j");
		assert.ok(shortcut);
		shortcut.handler(ctx);
		const expanded = widget?.factory(null, markerTheme("runtime")).render(80).join("\n");
		assert.match(stripTerminalSequences(expanded ?? ""), /available:.*bash.*read/);
		assert.match(stripTerminalSequences(expanded ?? ""), /denied:.*subagent/);
	} finally {
		if (saved.name === undefined) delete process.env.PI_SUBAGENT_NAME;
		else process.env.PI_SUBAGENT_NAME = saved.name;
		if (saved.agent === undefined) delete process.env.PI_SUBAGENT_AGENT;
		else process.env.PI_SUBAGENT_AGENT = saved.agent;
		if (saved.denied === undefined) delete process.env.PI_DENY_TOOLS;
		else process.env.PI_DENY_TOOLS = saved.denied;
	}
});
