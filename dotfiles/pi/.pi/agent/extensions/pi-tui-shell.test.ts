import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
	Component,
	EditorComponent,
	EditorTheme,
	TUI,
} from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import piTuiShell, {
	composeEditorShellRows,
	contextMeterFill,
	contextMeterText,
	createActivityTracker,
	createSessionAccountingCache,
	editorBottomRightText,
	editorTopLeftText,
	editorTopRightText,
	renderStatusFooter,
	type ContextDisplay,
	type ModelInfo,
	type SessionUsage,
	type ShellTheme,
	sanitizePlainTerminalText,
} from "./pi-tui-shell.ts";

const plainTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	getBgAnsi: () => "",
	getThinkingBorderColor: () => (text: string) => text,
} as unknown as ShellTheme;

function createExtensionHarness() {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const pi = {
		on(event: string, handler: (...args: unknown[]) => unknown) {
			const registered = handlers.get(event) ?? [];
			registered.push(handler);
			handlers.set(event, registered);
		},
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI;

	let configuredFactory:
		| ((
				tui: TUI,
				theme: EditorTheme,
				keybindings: KeybindingsManager,
		  ) => EditorComponent)
		| undefined;
	const setEditorComponent = (factory: typeof configuredFactory) => {
		configuredFactory = factory;
	};
	const ui = {
		setEditorComponent,
		getEditorComponent: () => configuredFactory,
		setWorkingVisible() {},
		setFooter() {},
		theme: plainTheme,
	};
	let entriesCalls = 0;
	let contextCalls = 0;
	let sessionEntries: unknown[] = [];
	const ctx = {
		mode: "tui",
		ui,
		model: undefined,
		getContextUsage: () => {
			contextCalls += 1;
			return undefined;
		},
		sessionManager: {
			getCwd: () => "/tmp",
			getSessionDir: () => `/tmp/pi-tui-shell-test-${process.pid}-missing`,
			getSessionFile: () => undefined,
			getEntries: () => {
				entriesCalls += 1;
				return sessionEntries;
			},
		},
	} as unknown as ExtensionContext;

	piTuiShell(pi);
	return {
		ctx,
		handlers,
		originalSetter: setEditorComponent,
		ui,
		getConfiguredFactory: () => configuredFactory,
		getAccountingCalls: () => ({
			entries: entriesCalls,
			context: contextCalls,
		}),
		setSessionEntries: (entries: unknown[]) => {
			sessionEntries = entries;
		},
	};
}

function emit(
	handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
	event: string,
	...args: unknown[]
): void {
	for (const handler of handlers.get(event) ?? []) handler(...args);
}

function assertLinesFit(lines: string[], width: number): void {
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= width,
			`line width ${visibleWidth(line)} exceeds ${width}: ${line}`,
		);
	}
}

test("plain terminal text removes executable controls", () => {
	const sanitized = sanitizePlainTerminalText(
		"\x1b[2Jtitle\x07\nnext\x1b]52;c;payload\x07",
	);
	assert.equal(sanitized.includes("\x1b"), false);
	assert.equal(sanitized.includes("\x07"), false);
	assert.match(sanitized, /title next/);
});

test("status footer renders extension statuses verbatim", () => {
	const status = "\x1b[31m· Claude 14/16·4.31M/5.02M 85.9%\x1b[0m";
	const rendered = renderStatusFooter(plainTheme, [status], 60).join("\n");
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Verifies raw status passthrough.
	assert.equal(rendered.includes(status), true);
	assert.equal(rendered.includes("◆"), false);
});

test("status footer joins multiple statuses with the shell separator", () => {
	const rendered = renderStatusFooter(
		plainTheme,
		["· first", "· second"],
		60,
	).join("\n");
	assert.match(rendered, /· first/);
	assert.match(rendered, /· second/);
	assert.equal(rendered.includes("◆"), false);
});

test("status footer renders no rows without visible extension statuses", () => {
	assert.deepEqual(renderStatusFooter(plainTheme, [], 60), []);
	assert.deepEqual(renderStatusFooter(plainTheme, ["", ""], 60), []);
});

test("editor top-left pairs the model with the thinking level", () => {
	const model: ModelInfo = {
		provider: "anthropic",
		id: "claude-opus-4",
		contextWindow: 200_000,
	};
	const rendered = editorTopLeftText(plainTheme, model, "high");
	assert.match(rendered, /anthropic\/claude-opus-4/);
	assert.match(rendered, /think high/);
	assert.ok(
		rendered.indexOf("anthropic/claude-opus-4") < rendered.indexOf("think high"),
	);
	assert.match(editorTopLeftText(plainTheme, undefined, "off"), /no model/);
});

test("editor top-left preserves think when compacted", () => {
	const model: ModelInfo = {
		provider: "anthropic",
		id: "claude-opus-4-1-20250805",
		contextWindow: 200_000,
	};
	const compact = editorTopLeftText(plainTheme, model, "high", 20);
	assert.match(compact, /think high/);
	assert.equal(compact.includes("anthropic"), false);

	const tighter = editorTopLeftText(plainTheme, model, "high", 14);
	assert.match(tighter, /think high/);
	assert.equal(tighter.includes("claude"), false);
});

test("activity tracker handles phases, parallel tools, and cleanup", () => {
	let changes = 0;
	const tracker = createActivityTracker(() => {
		changes += 1;
	});
	const snapshot = () => tracker.snapshot;
	assert.deepEqual(snapshot(), {
		phase: undefined,
		turn: undefined,
		currentTool: undefined,
		activeToolCount: 0,
	});

	tracker.setPhase("thinking");
	tracker.startTurn(2);
	tracker.setPhase("responding");
	tracker.startTool("tool-a", "read");
	tracker.startTool("tool-b", "edit");
	assert.deepEqual(snapshot(), {
		phase: "responding",
		turn: 3,
		currentTool: { toolCallId: "tool-b", toolName: "edit", order: 2 },
		activeToolCount: 2,
	});

	const changesBeforeUnknownEnd = changes;
	tracker.endTool("missing");
	assert.equal(changes, changesBeforeUnknownEnd);
	tracker.endTool("tool-b");
	assert.deepEqual(snapshot().currentTool, {
		toolCallId: "tool-a",
		toolName: "read",
		order: 1,
	});

	tracker.settle();
	assert.deepEqual(snapshot(), {
		phase: "settling",
		turn: 3,
		currentTool: undefined,
		activeToolCount: 0,
	});
	tracker.reset();
	assert.deepEqual(snapshot(), {
		phase: undefined,
		turn: undefined,
		currentTool: undefined,
		activeToolCount: 0,
	});
});

test("context meter fills five segments and uses semantic colors", () => {
	assert.equal(contextMeterFill(null), null);
	assert.equal(contextMeterFill(0), 0);
	assert.equal(contextMeterFill(50), 3);
	assert.equal(contextMeterFill(75), 4);
	assert.equal(contextMeterFill(100), 5);

	const colorTheme = {
		...plainTheme,
		fg: (color: string, text: string) => `<${color}>${text}`,
	} as unknown as ShellTheme;
	assert.match(
		contextMeterText(colorTheme, { text: "50k/200k", percent: 50 }),
		/<accent>███<dim>░░/,
	);
	assert.match(
		contextMeterText(colorTheme, { text: "150k/200k", percent: 75 }),
		/<warning>████<dim>░/,
	);
	assert.match(
		contextMeterText(colorTheme, { text: "190k/200k", percent: 95 }),
		/<error>█████$/,
	);
	assert.match(
		contextMeterText(colorTheme, { text: "?/200k", percent: null }),
		/<dim>░░░░░/,
	);
});

test("editor top-right removes cost before context detail", () => {
	const context: ContextDisplay = { text: "50k/200k", percent: 50 };
	const rendered = editorTopRightText(plainTheme, context, 0.412);
	assert.match(rendered, /\$0\.412/);
	assert.match(rendered, /ctx ███░░ 50k\/200k/);
	assert.ok(rendered.indexOf("$0.412") < rendered.indexOf("ctx"));

	const noCost = editorTopRightText(plainTheme, context, 0.412, 24);
	assert.equal(noCost.includes("$0.412"), false);
	assert.match(noCost, /ctx ███░░ 50k\/200k/);

	const noMeter = editorTopRightText(plainTheme, context, 0.412, 16);
	assert.equal(noMeter.includes("$0.412"), false);
	assert.equal(noMeter.includes("█"), false);
	assert.match(noMeter, /ctx 50k\/200k/);

	const absoluteOnly = editorTopRightText(plainTheme, context, 0.412, 12);
	assert.equal(absoluteOnly.includes("ctx"), false);
	assert.match(absoluteOnly, /50k\/200k/);
	assert.ok(
		visibleWidth(editorTopRightText(plainTheme, context, 0.412, 8)) <= 8,
	);
});

test("editor bottom-right renders live phases and parallel tools", () => {
	const usage: SessionUsage = {
		input: 1200,
		output: 340,
		cacheRead: 98_000,
		cacheWrite: 4200,
		cost: 0.412,
	};
	const ready = editorBottomRightText(plainTheme, {
		usage,
		turn: { state: "ready", spinnerFrame: "⠋" },
	});
	assert.match(ready, /↑1\.2k ↓340 R98k W4\.2k/);
	assert.equal(ready.includes("ready"), false);
	assert.equal(ready.includes("$"), false);

	const thinking = editorBottomRightText(plainTheme, {
		usage,
		turn: {
			state: "working",
			spinnerFrame: "⠹",
			elapsedMs: 72_000,
			activity: {
				phase: "thinking",
				turn: 3,
				currentTool: undefined,
				activeToolCount: 0,
			},
		},
	});
	assert.match(thinking, /⠹ thinking · t3 · 1m12s/);

	const parallelTools = editorBottomRightText(plainTheme, {
		usage,
		turn: {
			state: "working",
			spinnerFrame: "⠸",
			elapsedMs: 23_000,
			activity: {
				phase: "responding",
				turn: 3,
				currentTool: {
					toolCallId: "tool-b",
					toolName: "\x1b[2Jedit\x07",
					order: 2,
				},
				activeToolCount: 3,
			},
		},
	});
	assert.match(parallelTools, /⠸ edit \+2 · t3 · 23s/);
	assert.equal(parallelTools.includes("\x1b[2J"), false);
	assert.ok(parallelTools.indexOf("⠸") > parallelTools.indexOf("W4.2k"));

	const settling = editorBottomRightText(plainTheme, {
		usage,
		turn: {
			state: "settling",
			spinnerFrame: "⠦",
			elapsedMs: 5_000,
			activity: {
				phase: "settling",
				turn: 3,
				currentTool: undefined,
				activeToolCount: 0,
			},
		},
	});
	assert.match(settling, /⠦ settling · t3 · 5s/);
});

test("editor bottom-right collapses activity when ready", () => {
	const zeroUsage: SessionUsage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};
	assert.equal(
		editorBottomRightText(plainTheme, {
			usage: zeroUsage,
			turn: {
				state: "ready",
				spinnerFrame: "⠋",
				activity: {
					phase: "responding",
					turn: 4,
					currentTool: undefined,
					activeToolCount: 0,
				},
			},
		}),
		"",
	);
	assert.match(
		editorBottomRightText(plainTheme, {
			usage: zeroUsage,
			turn: { state: "working", spinnerFrame: "⠹" },
		}),
		/^ ⠹ thinking $/,
	);
	const partial = editorBottomRightText(plainTheme, {
		usage: { ...zeroUsage, input: 5 },
		turn: { state: "ready", spinnerFrame: "⠋" },
	});
	assert.match(partial, /↑5/);
	assert.equal(partial.includes("↓"), false);
});

test("editor bottom-right keeps activity before secondary statistics", () => {
	const usage: SessionUsage = {
		input: 1200,
		output: 340,
		cacheRead: 98_000,
		cacheWrite: 4200,
		cost: 0.412,
	};
	const turn = {
		state: "working",
		spinnerFrame: "⠹",
		elapsedMs: 72_000,
		activity: {
			phase: "responding",
			turn: 3,
			currentTool: { toolCallId: "tool", toolName: "edit", order: 1 },
			activeToolCount: 3,
		},
	} as const;
	const noCount = editorBottomRightText(plainTheme, {
		usage,
		turn,
		width: 35,
	});
	assert.match(noCount, /↑1\.2k ↓340/);
	assert.equal(noCount.includes("R98k"), false);
	assert.equal(noCount.includes("+2"), false);
	assert.match(noCount, /⠹ edit · t3 · 1m12s/);

	const noTurn = editorBottomRightText(plainTheme, {
		usage,
		turn,
		width: 31,
	});
	assert.match(noTurn, /↑1\.2k ↓340/);
	assert.equal(noTurn.includes("t3"), false);
	assert.match(noTurn, /⠹ edit · 1m12s/);

	const activityOnly = editorBottomRightText(plainTheme, {
		usage,
		turn,
		width: 18,
	});
	assert.equal(activityOnly.includes("↑"), false);
	assert.match(activityOnly, /⠹ edit · 1m12s/);
});

test("cockpit rows fit representative terminal widths", () => {
	const model: ModelInfo = {
		provider: "anthropic",
		id: "claude-opus-4-1-20250805",
		contextWindow: 200_000,
	};
	const context: ContextDisplay = { text: "50k/200k", percent: 25 };
	const usage: SessionUsage = {
		input: 1200,
		output: 340,
		cacheRead: 98_000,
		cacheWrite: 4200,
		cost: 0.412,
	};
	const turn = {
		state: "working",
		spinnerFrame: "⠹",
		elapsedMs: 23_000,
		activity: {
			phase: "responding",
			turn: 3,
			currentTool: { toolCallId: "tool", toolName: "edit", order: 1 },
			activeToolCount: 3,
		},
	} as const;

	for (const width of [120, 80, 60, 40, 26]) {
		const topRightBudget = Math.max(0, width - 3 - visibleWidth(" think high "));

		const editorRows = composeEditorShellRows({
			theme: plainTheme,
			width,
			nativeLines: ["prompt"],
			showingAutocomplete: false,
			topLeft: editorTopLeftText(plainTheme, model, "high"),
			topRight: editorTopRightText(
				plainTheme,
				context,
				usage.cost,
				topRightBudget,
			),
			bottomLeft: " ~/repo ",
			bottomRight: editorBottomRightText(plainTheme, { usage, turn }),
			fitBottomLeft: (maximumWidth) =>
				maximumWidth > 0 ? " ~/repo ".slice(0, maximumWidth) : "",
			fitTopLeft: (maximumWidth) =>
				editorTopLeftText(plainTheme, model, "high", maximumWidth),
			fitTopRight: (maximumWidth) =>
				editorTopRightText(plainTheme, context, usage.cost, maximumWidth),
			fitBottomRight: (maximumWidth) =>
				editorBottomRightText(plainTheme, {
					usage,
					turn,
					width: maximumWidth,
				}),
		});
		assertLinesFit(editorRows, width);
		if (width === 40) {
			assert.match(editorRows[0] ?? "", /think high/);
			assert.equal((editorRows[0] ?? "").includes("$0.412"), false);
		}
	}
});

test("session accounting cache recomputes only after invalidation", () => {
	let entriesCalls = 0;
	let contextCalls = 0;
	const entries: Array<Record<string, unknown>> = [
		{
			type: "message",
			message: {
				role: "assistant",
				usage: {
					input: 100,
					output: 50,
					cacheRead: 25,
					cacheWrite: 10,
					cost: { total: 0.01 },
				},
			},
		},
	];
	const ctx = {
		getContextUsage() {
			contextCalls += 1;
			return { contextWindow: 200_000, tokens: 50_000, percent: 25 };
		},
		sessionManager: {
			getEntries() {
				entriesCalls += 1;
				return entries;
			},
		},
	} as unknown as ExtensionContext;
	const cache = createSessionAccountingCache();
	const first = cache.read(ctx, undefined);
	const cached = cache.read(ctx, undefined);
	assert.strictEqual(cached, first);
	assert.equal(entriesCalls, 1);
	assert.equal(contextCalls, 1);
	assert.equal(first.usage.input, 100);
	assert.equal(first.context.text, "50k/200k");

	entries.push({
		type: "message",
		message: {
			role: "toolResult",
			usage: { output: 5, cost: { total: 0.02 } },
		},
	});
	assert.strictEqual(cache.read(ctx, undefined), first);

	cache.invalidate();
	const refreshed = cache.read(ctx, undefined);
	assert.notStrictEqual(refreshed, first);
	assert.equal(entriesCalls, 2);
	assert.equal(contextCalls, 2);
	assert.equal(refreshed.usage.output, 55);
	assert.equal(refreshed.usage.cost, 0.03);
});

test("borderless editor rows remain inside the shell", () => {
	const rows = composeEditorShellRows({
		theme: plainTheme,
		width: 20,
		nativeLines: ["first content", "last content"],
		showingAutocomplete: false,
		topLeft: "",
		topRight: "",
		bottomLeft: "",
		bottomRight: "",
		fitBottomLeft: () => "",
	});
	assert.equal(rows.length, 4);
	assert.match(rows[1] ?? "", /first content/);
	assert.match(rows[2] ?? "", /last content/);
});

test("narrow shell borders preserve think and active phase text", () => {
	const model: ModelInfo = {
		provider: "anthropic",
		id: "claude-opus-4-1-20250805",
		contextWindow: 200_000,
	};
	const usage: SessionUsage = {
		input: 1200,
		output: 340,
		cacheRead: 98_000,
		cacheWrite: 4200,
		cost: 0.412,
	};
	const turn = {
		state: "working",
		spinnerFrame: "⠹",
		elapsedMs: 72_000,
	} as const;
	const rows = composeEditorShellRows({
		theme: plainTheme,
		width: 26,
		nativeLines: ["content"],
		showingAutocomplete: false,
		topLeft: editorTopLeftText(plainTheme, model, "high"),
		topRight: "",
		bottomLeft: " ~/proj ",
		bottomRight: editorBottomRightText(plainTheme, { usage, turn }),
		fitBottomLeft: () => " ~/proj ",
		fitTopLeft: (width) => editorTopLeftText(plainTheme, model, "high", width),
		fitBottomRight: (width) =>
			editorBottomRightText(plainTheme, { usage, turn, width }),
	});
	assert.equal(rows.length, 3);
	assert.match(rows[0] ?? "", /think high/);
	assert.equal((rows[0] ?? "").includes("anthropic"), false);
	assert.match(rows[2] ?? "", /⠹ thinking/);
	assert.equal((rows[2] ?? "").includes("↑"), false);
});

test("editor interceptor frames default restores and cleans up on shutdown", () => {
	const harness = createExtensionHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start" },
		harness.ctx,
	);
	assert.notEqual(harness.ui.setEditorComponent, harness.originalSetter);

	harness.ui.setEditorComponent(undefined);
	const defaultFactory = harness.getConfiguredFactory();
	assert.equal(typeof defaultFactory, "function");
	assert.deepEqual(
		(defaultFactory as unknown as Record<symbol, { inner?: unknown }>)[
			Symbol.for("pi-tui-shell-frame")
		],
		{ inner: undefined },
	);

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
	assert.equal(harness.ui.setEditorComponent, harness.originalSetter);
});

test("frame wrapper forwards key-release capability", () => {
	const harness = createExtensionHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start" },
		harness.ctx,
	);

	const inner: EditorComponent = {
		wantsKeyRelease: true,
		render: () => ["content"],
		invalidate() {},
		getText: () => "",
		setText() {},
		handleInput() {},
	};
	harness.ui.setEditorComponent(() => inner);
	const factory = harness.getConfiguredFactory();
	assert.ok(factory);
	const wrapper = factory(
		{ requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
		{ borderColor: (text: string) => text, selectList: {} } as EditorTheme,
		{} as KeybindingsManager,
	) as Component & { wantsKeyRelease?: boolean };
	assert.equal(wrapper.wantsKeyRelease, true);
	wrapper.wantsKeyRelease = false;
	assert.equal(inner.wantsKeyRelease, false);

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
});

test("extension activity events drive the live rail and clear stale tools", () => {
	const harness = createExtensionHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start" },
		harness.ctx,
	);

	const inner: EditorComponent = {
		render: () => ["content", "second line"],
		invalidate() {},
		getText: () => "",
		setText() {},
		handleInput() {},
	};
	harness.ui.setEditorComponent(() => inner);
	const factory = harness.getConfiguredFactory();
	assert.ok(factory);
	const wrapper = factory(
		{ requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
		{ borderColor: (text: string) => text, selectList: {} } as EditorTheme,
		{} as KeybindingsManager,
	);

	emit(harness.handlers, "agent_start", {}, harness.ctx);
	emit(harness.handlers, "turn_start", { turnIndex: 2 }, harness.ctx);
	emit(
		harness.handlers,
		"message_update",
		{ message: { role: "assistant" } },
		harness.ctx,
	);
	emit(
		harness.handlers,
		"tool_execution_start",
		{ toolCallId: "tool-a", toolName: "read" },
		harness.ctx,
	);
	emit(
		harness.handlers,
		"tool_execution_start",
		{ toolCallId: "tool-b", toolName: "edit" },
		harness.ctx,
	);
	assert.match(wrapper.render(80).at(-1) ?? "", /edit \+1 · t3/);

	emit(
		harness.handlers,
		"tool_execution_end",
		{ toolCallId: "tool-b", toolName: "edit" },
		harness.ctx,
	);
	const fallback = wrapper.render(80).at(-1) ?? "";
	assert.match(fallback, /read · t3/);
	assert.equal(fallback.includes("edit"), false);

	emit(harness.handlers, "agent_end", {}, harness.ctx);
	const settling = wrapper.render(80).at(-1) ?? "";
	assert.match(settling, /settling · t3/);
	assert.equal(settling.includes("read"), false);

	emit(harness.handlers, "agent_settled", {}, harness.ctx);
	const settled = wrapper.render(80).at(-1) ?? "";
	assert.equal(settled.includes("settling"), false);
	assert.equal(settled.includes("⠋"), false);

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
});

test("editor frame invalidates accounting on session mutations", () => {
	const harness = createExtensionHarness();
	harness.setSessionEntries([
		{
			type: "message",
			message: {
				role: "assistant",
				usage: { input: 1, output: 1, cost: { total: 0 } },
			},
		},
	]);
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start" },
		harness.ctx,
	);

	const inner: EditorComponent = {
		render: () => ["content", "second line"],
		invalidate() {},
		getText: () => "",
		setText() {},
		handleInput() {},
	};
	harness.ui.setEditorComponent(() => inner);
	const factory = harness.getConfiguredFactory();
	assert.ok(factory);
	const wrapper = factory(
		{ requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
		{ borderColor: (text: string) => text, selectList: {} } as EditorTheme,
		{} as KeybindingsManager,
	);

	wrapper.render(80);
	wrapper.render(80);
	assert.deepEqual(harness.getAccountingCalls(), { entries: 1, context: 1 });

	emit(harness.handlers, "message_end", { type: "message_end" }, harness.ctx);
	wrapper.render(80);
	assert.deepEqual(harness.getAccountingCalls(), { entries: 2, context: 2 });

	emit(harness.handlers, "session_tree", { type: "session_tree" }, harness.ctx);
	wrapper.render(80);
	assert.deepEqual(harness.getAccountingCalls(), { entries: 3, context: 3 });

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
});
