import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import subagentDone, {
	buildTurnLimitExitSidecar,
	createTurnLimitTracker,
	findLatestAssistantError,
	parseDeniedTools,
	parseMaxTurnsEnv,
	renderSubagentToolsWidget,
	shouldAutoExitOnAgentEnd,
	shouldMarkUserTookOver,
	TURN_LIMIT_GRACE_TURNS,
	TURN_LIMIT_WRAP_UP_MESSAGE,
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

// ── task turn limits (PI_SUBAGENT_MAX_TURNS) ──

test("parseMaxTurnsEnv treats missing, non-finite, negative, and zero values as unlimited", () => {
	assert.equal(parseMaxTurnsEnv(undefined), undefined);
	assert.equal(parseMaxTurnsEnv(""), undefined);
	assert.equal(parseMaxTurnsEnv("   "), undefined);
	assert.equal(parseMaxTurnsEnv("abc"), undefined);
	assert.equal(parseMaxTurnsEnv("0"), undefined);
	assert.equal(parseMaxTurnsEnv("-3"), undefined);
	assert.equal(parseMaxTurnsEnv("Infinity"), undefined);
	assert.equal(parseMaxTurnsEnv("NaN"), undefined);
	assert.equal(parseMaxTurnsEnv("2.9"), 2);
	assert.equal(parseMaxTurnsEnv("5"), 5);
	assert.equal(parseMaxTurnsEnv(" 12 "), 12);
});

test("turn limit tracker steers exactly once at the soft limit and aborts only after five grace turns", () => {
	const tracker = createTurnLimitTracker({ maxTurns: 3 });
	const decisions = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => tracker.onTurnEnd());

	assert.deepEqual(decisions[0], {});
	assert.deepEqual(decisions[1], {});
	assert.deepEqual(decisions[2], { steerMessage: TURN_LIMIT_WRAP_UP_MESSAGE });
	// Grace turns 4–7 emit nothing; the hard abort lands on turn 8 = 3 + 5.
	assert.deepEqual(decisions[3], {});
	assert.deepEqual(decisions[4], {});
	assert.deepEqual(decisions[5], {});
	assert.deepEqual(decisions[6], {});
	assert.deepEqual(decisions[7], { hardAbort: true });
	// Exactly one steer and one abort across the whole run.
	assert.equal(decisions.filter((d) => d.steerMessage).length, 1);
	assert.equal(decisions.filter((d) => d.hardAbort).length, 1);
	// After the hard abort the tracker stays silent and frozen.
	assert.deepEqual(tracker.onTurnEnd(), {});
	assert.equal(tracker.turnCount, 8);
});

test("turn limit tracker with maxTurns 1 steers on the first completed turn", () => {
	const tracker = createTurnLimitTracker({ maxTurns: 1 });
	assert.deepEqual(tracker.onTurnEnd(), { steerMessage: TURN_LIMIT_WRAP_UP_MESSAGE });
	for (let i = 0; i < 4; i++) assert.deepEqual(tracker.onTurnEnd(), {});
	assert.deepEqual(tracker.onTurnEnd(), { hardAbort: true });
});

test("turn limit tracker honors custom grace turns and messages", () => {
	const tracker = createTurnLimitTracker({ maxTurns: 2, graceTurns: 1, steerMessage: "custom wrap up" });
	assert.deepEqual(tracker.onTurnEnd(), {});
	assert.deepEqual(tracker.onTurnEnd(), { steerMessage: "custom wrap up" });
	// One grace turn, then the hard abort at 2 + 1.
	assert.deepEqual(tracker.onTurnEnd(), { hardAbort: true });
	assert.deepEqual(tracker.onTurnEnd(), {});
});

interface TurnLimitHarness {
	handlers: Map<string, Function>;
	/** Event context shaped like the real ExtensionContext: abort() and shutdown() live here, not on the API. */
	ctx: {
		shutdownCalls: number;
		abortCalls: number;
		abort(): void;
		shutdown(): void;
	};
	steered: string[];
	sidecarFile: string | undefined;
}

function runTaskChildWithTurns(maxTurns: number, turns: number): TurnLimitHarness {
	const handlers = new Map<string, Function>();
	const steered: string[] = [];
	const api = {
		on(name: string, handler: Function) {
			handlers.set(name, handler);
		},
		getAllTools() {
			return [];
		},
		registerShortcut() {},
		registerTool() {},
		sendUserMessage(message: string, options?: { deliverAs?: string }) {
			steered.push(`${options?.deliverAs ?? "turn"}:${message}`);
		},
	};
	const harness: TurnLimitHarness = {
		handlers,
		ctx: {
			shutdownCalls: 0,
			abortCalls: 0,
			abort() {
				harness.ctx.abortCalls++;
			},
			shutdown() {
				harness.ctx.shutdownCalls++;
			},
		},
		steered,
		sidecarFile: undefined,
	};
	const previous = {
		id: process.env.PI_SUBAGENT_ID,
		session: process.env.PI_SUBAGENT_SESSION,
		autoExit: process.env.PI_SUBAGENT_AUTO_EXIT,
		maxTurns: process.env.PI_SUBAGENT_MAX_TURNS,
		activityFile: process.env.PI_SUBAGENT_ACTIVITY_FILE,
	};
	const sessionFile = join(tmpdir(), `pi-turn-limit-${Math.random().toString(16).slice(2)}.jsonl`);
	process.env.PI_SUBAGENT_ID = "turnlimit1";
	process.env.PI_SUBAGENT_SESSION = sessionFile;
	process.env.PI_SUBAGENT_AUTO_EXIT = "1";
	process.env.PI_SUBAGENT_ACTIVITY_FILE = join(tmpdir(), "pi-turn-limit-activity.json");
	process.env.PI_SUBAGENT_MAX_TURNS = String(maxTurns);
	try {
		subagentDone(api as never);
		for (let turn = 0; turn < turns; turn++) {
			handlers.get("turn_end")?.({ turnIndex: turn }, harness.ctx);
		}
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key as keyof typeof previous];
			else (process.env as Record<string, string | undefined>)[key] = value;
		}
	}
	harness.sidecarFile = existsSync(`${sessionFile}.exit`) ? `${sessionFile}.exit` : undefined;
	return harness;
}

test("task child queues the exact wrap-up steer once at the soft limit", () => {
	const harness = runTaskChildWithTurns(3, 3);
	assert.deepEqual(harness.steered, [
		`steer:${TURN_LIMIT_WRAP_UP_MESSAGE}`,
	]);
	assert.equal(harness.ctx.abortCalls, 0);
	assert.equal(harness.sidecarFile, undefined, "no failure sidecar at the soft limit");
});

test("task child writes the failure sidecar, aborts, and shuts down at the hard limit", () => {
	const harness = runTaskChildWithTurns(2, 7); // soft at 2, hard at 2 + 5
	assert.deepEqual(harness.steered, [`steer:${TURN_LIMIT_WRAP_UP_MESSAGE}`]);
	// Abort and shutdown were requested through the event context, in order,
	// with the sidecar already persisted.
	assert.equal(harness.ctx.abortCalls, 1);
	assert.equal(harness.ctx.shutdownCalls, 1);

	// The failure sidecar is persisted before the shutdown request.
	assert.ok(harness.sidecarFile, "hard-limit sidecar must be written");
	const sidecar = JSON.parse(readFileSync(harness.sidecarFile!, "utf8"));
	assert.equal(sidecar.type, "turn-limit");
	assert.equal(sidecar.maxTurns, 2);
	assert.equal(sidecar.graceTurns, TURN_LIMIT_GRACE_TURNS);
	assert.match(sidecar.errorMessage, /exceeded its turn limit/);
	assert.equal(
		readFileSync(harness.sidecarFile!, "utf8").trim(),
		buildTurnLimitExitSidecar(2, TURN_LIMIT_GRACE_TURNS),
	);

	// agent_end after the hard limit is a backstop that shuts down again,
	// even though the aborted run would otherwise keep the pane open.
	harness.handlers.get("agent_end")?.(
		{ messages: [{ role: "assistant", stopReason: "aborted" }] },
		harness.ctx,
	);
	assert.equal(harness.ctx.shutdownCalls, 2, "backstop shutdown after the immediate one");
});

test("task child completing during grace shuts down cleanly with no sidecar", () => {
	const harness = runTaskChildWithTurns(2, 4); // soft at 2, wrapped up during grace
	assert.deepEqual(harness.steered, [`steer:${TURN_LIMIT_WRAP_UP_MESSAGE}`]);
	assert.equal(harness.ctx.abortCalls, 0);
	assert.equal(harness.sidecarFile, undefined);

	harness.handlers.get("agent_end")?.(
		{ messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "wrapped up" }] }] },
		harness.ctx,
	);
	assert.equal(harness.ctx.shutdownCalls, 1, "ordinary auto-exit still applies during grace");
});

test("task child without a limit never steers or aborts", () => {
	const harness = runTaskChildWithTurns(0, 12); // 0 = unlimited
	assert.deepEqual(harness.steered, []);
	assert.equal(harness.ctx.abortCalls, 0);
	assert.equal(harness.sidecarFile, undefined);
	harness.handlers.get("agent_end")?.(
		{ messages: [{ role: "assistant", stopReason: "stop" }] },
		harness.ctx,
	);
	assert.equal(harness.ctx.shutdownCalls, 1);
});
