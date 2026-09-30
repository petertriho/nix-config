import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { SessionManager, formatSkillsForPrompt, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import piContext, { ContextModal, createContextSnapshot, safeText } from "../pi-context.ts";

test("snapshot uses the active, edited and compacted projection rather than historical entries", () => {
	const session = SessionManager.inMemory();
	session.appendMessage({ role: "user", content: "obsolete", timestamp: 1 });
	const old = session.getLeafId()!;
	session.appendMessage({ role: "user", content: "abandoned", timestamp: 2 });
	session.branch(old);
	session.appendMessage({ role: "user", content: "retained", timestamp: 3 });
	const retained = session.getLeafId()!;
	session.appendCompaction("summary of obsolete", retained, 100);
	session.appendContextEdit(retained, { content: "replaced" });
	const snapshot = createContextSnapshot({
		prompt: "effective prompt", options: { cwd: "/" },
		activeTools: [], allTools: [], projection: session.buildSessionProjection(),
		model: undefined, usage: undefined, branch: session.getBranch(),
	});
	const text = snapshot.rows.map((row) => row.preview).join(" ");
	assert.match(text, /summary of obsolete/);
	assert.match(text, /replaced/);
	assert.doesNotMatch(text, /abandoned|retained/);
	assert.equal(snapshot.usage.percent, null);
});

test("inventory excludes removed entries and keeps replaced tool results, custom and multimodal content", () => {
	const session = SessionManager.inMemory();
	session.appendMessage({ role: "user", content: "remove me", timestamp: 1 });
	const removed = session.getLeafId()!;
	session.appendCustomMessageEntry("injected", "custom visible", false);
	session.appendMessage({ role: "toolResult", toolCallId: "c", toolName: "read",
		content: [{ type: "text", text: "old output" }], isError: false, timestamp: 2 });
	const result = session.getLeafId()!;
	session.appendContextEdit(removed, null);
	session.appendContextEdit(result, { content: "new output" });
	session.appendMessage({ role: "user", content: [{ type: "image", data: "sensitive", mimeType: "image/png" }], timestamp: 3 });
	const skill = { name: "skill", description: "description", disableModelInvocation: false,
		filePath: "/skill", baseDir: "/", sourceInfo: { source: "test", path: "/skill", scope: "user", origin: "top-level" } } as const;
	const snapshot = createContextSnapshot({
		prompt: `AGENTS rules\n${formatSkillsForPrompt([skill])}`, options: { cwd: "/", contextFiles: [{ path: "AGENTS.md", content: "AGENTS rules" }],
			skills: [skill] },
		activeTools: ["read"], allTools: [{ name: "read", description: "Read a file", parameters: {},
			exposure: "direct", promptGuidelines: [], sourceInfo: { source: "test", path: "/read", scope: "user", origin: "top-level" } }, { name: "write", description: "Not active",
			parameters: {}, exposure: "direct", promptGuidelines: [], sourceInfo: { source: "test", path: "/write", scope: "user", origin: "top-level" } }],
		projection: session.buildSessionProjection(), model: undefined, usage: undefined, branch: session.getBranch(),
	});
	const all = snapshot.rows.map((r) => `${r.label} ${r.preview}`).join(" ");
	assert.match(all, /custom visible.*new output.*image content/);
	assert.doesNotMatch(all, /remove me|old output|Not active|sensitive/);
	assert.equal(snapshot.rows.filter((r) => r.group === "Tools").length, 1);
	assert.equal(snapshot.rows.filter((r) => r.nested).length, 2);
	assert.deepEqual(snapshot.rows.slice(0, 3).map((r) => r.group), ["System prompt", "Context files", "Skills"]);
	assert.equal(snapshot.rows.at(-1)?.estimate, "unknown");
});

test("rows clip and sanitize controls; usage is separate from estimates and withheld after model changes", () => {
	const session = SessionManager.inMemory();
	session.appendMessage({ role: "user", content: `\x1b[31m${"界".repeat(500)}\x07`, timestamp: 1 });
	session.appendMessage({ role: "assistant", content: [{ type: "text", text: "answer" }],
		api: "test", provider: "p", model: "m", stopReason: "stop", timestamp: 2,
		usage: { input: 20, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 22,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
	const input = { prompt: "prompt", options: { cwd: "/" }, activeTools: [], allTools: [],
		projection: session.buildSessionProjection(), branch: session.getBranch(),
		model: { provider: "p", id: "m", contextWindow: 100 }, usage: { tokens: 22, contextWindow: 100, percent: 22 } };
	const current = createContextSnapshot(input);
	assert.equal(current.usage.percent, 22);
	assert.match(current.usage.provenance, /last accounted request/);
	assert.match(current.rows[1].estimate, /^~/);
	assert.ok(current.rows[1].preview.length < 400);
	assert.match(current.rows[1].preview, /clipped/);
	assert.doesNotMatch(current.rows[1].preview, /[\x00-\x1f\x7f-\x9f]/);
	assert.equal(safeText("hello\x1b]0;malicious\x07\nworld\u202e"), "hello world");
	assert.equal(createContextSnapshot({ ...input, model: { provider: "p", id: "other", contextWindow: 100 } }).usage.percent, null);
	session.appendContextEdit(session.getBranch()[0].id, { content: "new" });
	assert.equal(createContextSnapshot({ ...input, projection: session.buildSessionProjection(), branch: session.getBranch() }).usage.percent, null);
	session.branch(session.getBranch()[1].id);
	session.branchWithSummary(session.getLeafId(), "new branch summary");
	const branched = createContextSnapshot({ ...input, projection: session.buildSessionProjection(),
		branch: session.getBranch() });
	assert.equal(branched.usage.percent, null);
	assert.match(branched.rows.map((r) => r.preview).join(" "), /new branch summary/);
});

test("empty session still offers a prompt but no invented usage", () => {
	const session = SessionManager.inMemory();
	const snapshot = createContextSnapshot({ prompt: "", options: { cwd: "/" }, activeTools: [],
		allTools: [], projection: session.buildSessionProjection(), branch: session.getBranch(),
		model: undefined, usage: undefined });
	assert.equal(snapshot.rows.length, 1);
	assert.equal(snapshot.usage.percent, null);
	assert.equal(createContextSnapshot({ prompt: "", options: { cwd: "/" }, activeTools: [],
		allTools: [], projection: session.buildSessionProjection(), branch: [],
		model: { provider: "missing", id: "none", contextWindow: 0 }, usage: undefined }).usage.window, null);
});

test("compaction retains selected earlier messages and summaries, but not summarized history", () => {
	const session = SessionManager.inMemory();
	session.appendMessage({ role: "user", content: "summarized-away", timestamp: 1 });
	session.appendMessage({ role: "user", content: "kept-before-compaction", timestamp: 2 });
	const keep = session.getLeafId()!;
	session.appendCompaction("condensed", keep, 200);
	session.appendMessage({ role: "assistant", content: [{ type: "toolCall", id: "c", name: "read",
		arguments: { path: "/tmp/example" } }], provider: "p", model: "m", api: "test",
		stopReason: "toolUse", timestamp: 3, usage: { input: 0, output: 0, cacheRead: 0,
			cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
	const snapshot = createContextSnapshot({ prompt: "prompt", options: { cwd: "/" },
		activeTools: [], allTools: [], projection: session.buildSessionProjection(),
		branch: session.getBranch(), model: undefined, usage: undefined });
	const text = snapshot.rows.map((r) => r.preview).join(" ");
	assert.match(text, /condensed.*kept-before-compaction.*Tool call read:.*example/);
	assert.doesNotMatch(text, /summarized-away/);
});

test("modal keeps section navigation and a preview usable within narrow and short dimensions", () => {
	const rows = Array.from({ length: 30 }, (_, n) => ({
		group: "Conversation" as const, label: `界${n}`, preview: `${"界".repeat(120)} ${n}`, estimate: "~60",
	}));
	let closed = 0;
	let renders = 0;
	const tui = { terminal: { rows: 12 }, requestRender: () => { renders++; } };
	const theme = { fg: (_color: string, text: string) => `\x1b[32m${text}\x1b[0m` };
	const modal = new ContextModal({ rows, usage: { tokens: null, window: null, percent: null,
		provenance: "Unknown" } }, tui, theme, () => { closed++; });
	modal.handleInput("\x1b[6~");
	modal.handleInput("j");
	modal.handleInput("j");
	modal.handleInput("j");
	for (const width of [14, 40, 100]) {
		const lines = modal.render(width);
		assert.ok(lines.length <= tui.terminal.rows - 2);
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
		assert.ok(lines.some((line) => line.includes(width < 20 ? "▸ C" : "Conversation")));
	}
	modal.handleInput("\r");
	assert.match(modal.render(100).join("\n"), /界0/);
	modal.handleInput("k");
	modal.handleInput("\x1b[B");
	modal.handleInput("\x1b[A");
	modal.handleInput("\x1b[5~");
	modal.handleInput("\x1b");
	assert.equal(closed, 1);
	assert.equal(renders, 9);
});

test("command guards non-TUI and reconstructs a fresh snapshot on each TUI opening", async () => {
	let handler: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	let description = "";
	const pi = { registerCommand: (_name: string, command: { handler: typeof handler; description: string }) => {
		handler = command.handler;
		description = command.description;
	}, getActiveTools: () => [], getAllTools: () => [] } as unknown as ExtensionAPI;
	piContext(pi);
	assert.ok(handler);
	assert.match(description, /snapshot of current prompt, tools, and conversation context/);
	assert.doesNotMatch(description, /next.request/);
	const notices: string[] = [];
	let openings = 0;
	let projections = 0;
	let failure = false;
	const session = SessionManager.inMemory();
	const ctx = {
		mode: "rpc", hasUI: true, model: undefined, getSystemPrompt: () => "prompt",
		getSystemPromptOptions: () => ({ cwd: "/" }), getContextUsage: () => undefined,
		sessionManager: { getBranch: () => session.getBranch(),
			buildSessionProjection: () => {
				projections++;
				if (failure) throw new Error("projection failed");
				return session.buildSessionProjection();
			} },
		ui: { notify: (message: string) => { notices.push(message); },
			custom: (factory: (tui: unknown, theme: unknown, keys: unknown, done: () => void) => ContextModal) => {
				openings++;
				const modal = factory({ terminal: { rows: 24 }, requestRender: () => {} },
					{ fg: (_color: string, text: string) => text }, {}, () => {});
				const display = modal.render(50).join("\n");
				if (failure) assert.match(display, /projection unavailable/);
				else assert.match(display, /prompt/);
				return Promise.resolve();
			} },
	} as unknown as ExtensionCommandContext;
	await handler!("", ctx);
	assert.match(notices[0], /requires interactive TUI/);
	assert.equal(projections, 0);
	const originalError = console.error;
	const errors: string[] = [];
	console.error = (message: string) => { errors.push(message); };
	try {
		await handler!("", { ...ctx, mode: "print", hasUI: false } as ExtensionCommandContext);
	} finally {
		console.error = originalError;
	}
	assert.match(errors[0] ?? "", /requires interactive TUI/);
	const tuiCtx = { ...ctx, mode: "tui" } as ExtensionCommandContext;
	await handler!("", tuiCtx);
	session.appendMessage({ role: "user", content: "new after reopen", timestamp: 1 });
	await handler!("", tuiCtx);
	assert.equal(openings, 2);
	assert.equal(projections, 2);
	failure = true;
	await handler!("", tuiCtx);
	assert.equal(openings, 3);
	assert.equal(projections, 3);
});

test("Enter expands a section and shows its selected item's preview", () => {
	const rows = [{ group: "System prompt" as const, label: "long", preview: "start " + "a".repeat(90) + " END", estimate: "~25" }];
	const modal = new ContextModal({ rows, usage: { tokens: null, window: null, percent: null,
		provenance: "Unknown" } }, { terminal: { rows: 30 }, requestRender: () => {} },
		{ fg: (_color: string, value: string) => value }, () => {});
	assert.doesNotMatch(modal.render(80).join(" "), / END/);
	modal.handleInput("\r");
	modal.handleInput("j");
	const rendered = modal.render(80);
	assert.match(rendered.join(" "), /start/);
	assert.match(rendered.join(" "), / END/);
	assert.ok(rendered.some((line) => line.includes("long")));
	assert.ok(rendered.every((line) => visibleWidth(line) <= 80));
	modal.handleInput("\x1b[D");
	assert.doesNotMatch(modal.render(80).join(" "), /long/);
});

for (const [name, collapse, expand] of [
	["h/l", "h", "l"],
	["left/right", "\x1b[D", "\x1b[C"],
] as const) {
	test(`${name} explicitly collapse and expand groups, including from a child`, () => {
		const modal = new ContextModal({
			rows: [{ group: "System prompt", label: "prompt-source", preview: "selected body", estimate: "~3" }],
			usage: { tokens: null, window: null, percent: null, provenance: "Unknown" },
		}, { terminal: { rows: 30 }, requestRender: () => {} },
			{ fg: (_color: string, text: string) => text }, () => {});
		const display = () => modal.render(104).join("\n");
		modal.handleInput(collapse);
		assert.doesNotMatch(display(), /prompt-source/);
		modal.handleInput(expand);
		assert.match(display(), /prompt-source/);
		modal.handleInput(expand);
		assert.match(display(), /prompt-source/);
		modal.handleInput(collapse);
		assert.doesNotMatch(display(), /prompt-source/);
		modal.handleInput(expand);
		modal.handleInput("j");
		modal.handleInput(expand);
		assert.match(display(), /selected body/);
		modal.handleInput(collapse);
		assert.doesNotMatch(display(), /prompt-source|selected body/);
		assert.match(display(), /› ▸ System prompt/);
		modal.handleInput(expand);
		assert.match(display(), /prompt-source/);
	});
}

test("the preview column marks content clipped by the viewport", () => {
	const modal = new ContextModal({
		rows: [{ group: "Tools", label: "Tool: long", preview: "a".repeat(360), estimate: "~90" }],
		usage: { tokens: null, window: null, percent: null, provenance: "Unknown" },
	}, { terminal: { rows: 18 }, requestRender: () => {} },
		{ fg: (_color: string, text: string) => text }, () => {});
	for (let i = 0; i < 3; i++) modal.handleInput("j");
	modal.handleInput("\r");
	modal.handleInput("j");
	assert.match(modal.render(80).join("\n"), /\[preview clipped\]/);
});

test("tiny terminals prioritize a section and preview over decorative header lines", () => {
	const modal = new ContextModal({
		rows: [{ group: "System prompt", label: "prompt", preview: "preview", estimate: "~2" }],
		usage: { tokens: 30, window: 100, percent: 30, provenance: "Pi estimate" },
	}, { terminal: { rows: 6 }, requestRender: () => {} },
		{ fg: (_color: string, text: string) => text }, () => {});
	const lines = modal.render(22);
	assert.ok(lines.length <= 6);
	assert.match(lines.join(" "), /System.*Effective prompt/);
});

test("modal draws a Pi usage bar only for attributable readings and handles projection failure", () => {
	const ui = { terminal: { rows: 24 }, requestRender: () => {} };
	const theme = { fg: (_color: string, text: string) => text };
	const rows = [{ group: "System prompt" as const, label: "prompt", preview: "text", estimate: "~1" }];
	const known = new ContextModal({ rows, usage: { tokens: 50, window: 100, percent: 50,
		provenance: "Pi estimate" } }, ui, theme, () => {}).render(60).join("\n");
	assert.match(known, /50\.0%/);
	assert.match(known, /━/);
	const unknown = new ContextModal({ rows: [], usage: { tokens: null, window: null,
		percent: null, provenance: "Unknown" }, error: "projection unavailable" },
		ui, theme, () => {}).render(60).join("\n");
	assert.match(unknown, /projection unavailable.*No model-visible rows/s);
	assert.doesNotMatch(unknown, /━|%/);
});

test("narrow rows keep their estimates when a source label is longer than the viewport", () => {
	const snapshot = {
		rows: [{ group: "Context files" as const,
			label: "↳ Context file: /home/peter/some/really/long/project/path/AGENTS.md (within prompt)",
			preview: "rules", estimate: "~247" }],
		usage: { tokens: null, window: null, percent: null, provenance: "Unknown" },
	};
	const modal = new ContextModal(snapshot, { terminal: { rows: 18 }, requestRender: () => {} },
		{ fg: (_color: string, text: string) => text }, () => {});
	modal.handleInput("\x1b[B");
	modal.handleInput("\r");
	modal.handleInput("\x1b[B");
	const lines = modal.render(46);
	assert.ok(lines.some((line) => line.includes("AGENTS.md") && line.includes("~247")));
	assert.match(lines.join("\n"), /Context file:.*AGENTS\.md/s);
	assert.ok(lines.every((line) => visibleWidth(line) <= 46));
});

test("short terminals never show a valid percentage without its usage provenance", () => {
	const modal = new ContextModal({
		rows: [{ group: "System prompt" as const, label: "prompt", preview: "text", estimate: "~1" }],
		usage: { tokens: 42, window: 1000, percent: 4.2,
			provenance: "Pi estimate · last accounted request + trailing content (not current wire payload)" },
	}, { terminal: { rows: 9 }, requestRender: () => {} },
		{ fg: (_color: string, text: string) => text }, () => {});
	const lines = modal.render(46).join("\n");
	assert.doesNotMatch(lines, /4\.2%/);
	assert.match(lines, /System prompt/);
	assert.ok(lines.split("\n").every((line) => visibleWidth(line) <= 46));
});

test("collapsed sections show counts and estimates without a background fill", () => {
	const rows = [
		{ group: "System prompt" as const, label: "Effective system prompt", preview: "full prompt", estimate: "~50" },
		{ group: "Skills" as const, label: "Skill index: example", preview: "description", estimate: "~3" },
		{ group: "Tools" as const, label: "Tool: read", preview: "definition", estimate: "unknown" },
	];
	const backgroundCalls: string[] = [];
	const theme = {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => { backgroundCalls.push(text); return text; },
	};
	const modal = new ContextModal({ rows, usage: { tokens: null, window: 1000, percent: null, provenance: "Unknown" } },
		{ terminal: { rows: 32 }, requestRender: () => {} }, theme, () => {});
	const lines = modal.render(140);
	assert.match(lines.join("\n"), /System prompt\s+1 item · ~50/);
	assert.match(lines.join("\n"), /Skills\s+1 item · ~3/);
	assert.match(lines.join("\n"), /Tools\s+1 item · unknown/);
	assert.doesNotMatch(lines.join("\n"), /Skill index: example|Tool: read/);
	assert.ok(lines[0]!.startsWith(" ".repeat(18) + "╭"));
	assert.equal(backgroundCalls.length, 0);
	assert.ok(lines.some((line) => line.includes("│") && line.includes("Effective prompt at this snapshot")));
});

test("large tool results build a bounded preview within a small heap", () => {
	const script = `
		import { createContextSnapshot } from "./pi-context.ts";
		const text = "x".repeat(10_000_000);
		const before = process.memoryUsage().heapUsed;
		const snapshot = createContextSnapshot({
			prompt: "", options: { cwd: "/" }, activeTools: [], allTools: [],
			model: undefined, usage: undefined, branch: [],
			projection: { entries: [{ sourceEntry: { type: "message", id: "tool", parentId: null, timestamp: "" },
				messages: [{ role: "toolResult", toolName: "read", content: [{ type: "text", text }] }] }],
				messages: [], model: null, thinkingLevel: "off" },
		});
		const result = snapshot.rows[1];
		if (result.estimate !== "~2500000" || result.preview.length > 400 || !result.preview.includes("[clipped]"))
			throw new Error(JSON.stringify(result));
		if (process.memoryUsage().heapUsed - before > 40_000_000)
			throw new Error("Snapshot allocated more than 40 MB for a 10 MB tool result");
	`;
	const child = spawnSync(process.execPath,
		["--max-old-space-size=64", "--input-type=module", "-e", script],
		{ cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30000 });
	assert.equal(child.status, 0, child.error?.message ?? child.stderr);
});
