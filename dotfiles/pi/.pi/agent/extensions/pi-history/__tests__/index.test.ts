import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type EditorComponent,
	type EditorTheme,
	stripTerminalSequences,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import piTuiShell from "../../pi-tui-shell.ts";
import piHistory, {
	type PiHistoryDependencies,
	type PiHistoryStoreLike,
} from "../index.ts";
import type { PickerResult, PromptItem, VimMode } from "../model.ts";
import { createHistoryPicker, type HistoryPicker } from "../picker.ts";
import {
	type IndexState,
	type LiveSession,
	PiHistoryStore,
	type SessionListing,
} from "../store.ts";

type EventHandler = (...args: unknown[]) => unknown;
type EditorFactory = NonNullable<
	ReturnType<ExtensionContext["ui"]["getEditorComponent"]>
>;
type WidgetFactory = (tui: TUI, theme: Theme) => Component;

class FakeTimers {
	private now = 0;
	private nextId = 1;
	private readonly tasks = new Map<
		number,
		{ callback: () => void; due: number }
	>();
	cleared = 0;

	readonly dependencies = {
		setTimeout: (callback: () => void, delay: number) => {
			const id = this.nextId++;
			this.tasks.set(id, {
				callback,
				due: this.now + Math.max(0, delay),
			});
			return id as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
			if (this.tasks.delete(timer as unknown as number)) this.cleared += 1;
		},
	};

	get activeCount(): number {
		return this.tasks.size;
	}

	advanceBy(milliseconds: number): void {
		this.now += Math.max(0, milliseconds);
		for (;;) {
			const ready = [...this.tasks.entries()]
				.filter(([, task]) => task.due <= this.now)
				.sort((left, right) => left[1].due - right[1].due)[0];
			if (!ready) return;
			const [id, task] = ready;
			this.tasks.delete(id);
			task.callback();
		}
	}
}

type ThemeCall =
	| { kind: "fg"; token: string; text: string }
	| { kind: "bg"; token: string; text: string }
	| { kind: "bold"; text: string };

function recordingTheme(
	palette = { fg: 36, bg: 44, bold: 1 },
): { theme: Theme; calls: ThemeCall[] } {
	const calls: ThemeCall[] = [];
	return {
		theme: {
			fg(token: string, text: string) {
				calls.push({ kind: "fg", token, text });
				return `\u001b[${palette.fg}m${text}\u001b[39m`;
			},
			bg(token: string, text: string) {
				calls.push({ kind: "bg", token, text });
				return `\u001b[${palette.bg}m${text}\u001b[49m`;
			},
			bold(text: string) {
				calls.push({ kind: "bold", text });
				return `\u001b[${palette.bold}m${text}\u001b[22m`;
			},
		} as unknown as Theme,
		calls,
	};
}

function instantiateWidget(
	value: unknown,
	theme: Theme,
): Component | undefined {
	if (value === undefined) return undefined;
	if (Array.isArray(value)) {
		return {
			render: () => value as string[],
			invalidate() {},
		};
	}
	assert.equal(typeof value, "function");
	return (value as WidgetFactory)(
		{ requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
		theme,
	);
}

class FakeEditor implements EditorComponent {
	text = "";
	readonly inputs: string[] = [];
	readonly history: string[] = [];
	inner?: EditorComponent;
	vimState?: { mode: VimMode };

	render(): string[] {
		return ["editor"];
	}
	invalidate(): void {}
	getText(): string {
		return this.text;
	}
	setText(text: string): void {
		this.text = text;
	}
	handleInput(data: string): void {
		this.inputs.push(data);
	}
	addToHistory(text: string): void {
		this.history.push(text);
	}
}

class FakeStore implements PiHistoryStoreLike {
	stashes: PromptItem[] = [];
	history: PromptItem[] = [];
	state: IndexState = {
		active: false,
		warnings: [],
		productive: false,
	};
	inserted: Array<{ text: string; cwd: string }> = [];
	mutations: Array<{
		cwd: string;
		currentDraft: string;
		replacementText: string;
		poppedStashId?: number;
	}> = [];
	refreshes: string[] = [];
	closed = false;
	failInsert = false;
	failMutation = false;
	failDelete = false;
	private nextId = 100;
	private readonly listeners = new Set<(state: IndexState) => void>();

	insertStash(text: string, cwd: string): number {
		if (this.failInsert) throw new Error("insert failed");
		this.inserted.push({ text, cwd });
		const id = this.nextId++;
		this.stashes.unshift({
			kind: "stash",
			id,
			text,
			cwd,
			timestamp: id,
		});
		return id;
	}
	listStashes(cwd: string): PromptItem[] {
		return this.stashes.filter((item) => item.cwd === cwd);
	}
	deleteStash(id: number, cwd: string): boolean {
		if (this.failDelete) throw new Error("delete failed");
		const index = this.stashes.findIndex(
			(item) => item.id === id && item.cwd === cwd,
		);
		if (index < 0) return false;
		this.stashes.splice(index, 1);
		return true;
	}
	mutateForApply(input: {
		cwd: string;
		currentDraft: string;
		replacementText: string;
		poppedStashId?: number;
	}): { autoStashed: boolean; popped: boolean } {
		if (this.failMutation) throw new Error("mutation failed");
		this.mutations.push(input);
		const autoStashed =
			input.currentDraft.trim().length > 0 &&
			input.currentDraft !== input.replacementText;
		if (autoStashed) this.insertStash(input.currentDraft, input.cwd);
		if (input.poppedStashId !== undefined) {
			if (!this.deleteStash(input.poppedStashId, input.cwd)) {
				throw new Error("stash missing");
			}
		}
		return {
			autoStashed,
			popped: input.poppedStashId !== undefined,
		};
	}
	listHistory(_cwd: string, _live?: LiveSession): PromptItem[] {
		return [...this.history];
	}
	getIndexState(): IndexState {
		return { ...this.state, warnings: [...this.state.warnings] };
	}
	subscribe(_cwd: string, listener: (state: IndexState) => void): () => void {
		this.listeners.add(listener);
		listener(this.getIndexState());
		return () => this.listeners.delete(listener);
	}
	refreshHistory(cwd: string): Promise<void> {
		this.refreshes.push(cwd);
		return Promise.resolve();
	}
	emitState(state: IndexState): void {
		this.state = state;
		for (const listener of this.listeners) listener(this.getIndexState());
	}
	close(): Promise<void> {
		this.closed = true;
		return Promise.resolve();
	}
}

function stash(id: number, text: string, cwd = "/repo"): PromptItem {
	return { kind: "stash", id, text, cwd, timestamp: id };
}

function history(id: string, text: string): PromptItem {
	return {
		kind: "history",
		id,
		text,
		cwd: "/repo",
		timestamp: 10,
		sessionPath: `/sessions/${id}.jsonl`,
	};
}

function createHarness<Store extends PiHistoryStoreLike = FakeStore>(
	options: {
		mode?: ExtensionContext["mode"];
		store?: Store;
		branch?: unknown[];
		baseFactory?: EditorFactory;
		stashResults?: Array<PickerResult | null>;
		stashDeferred?: Promise<PickerResult | null>;
		openStashPicker?: PiHistoryDependencies["openStashPicker"];
		historyResults?: Array<PickerResult | null>;
		historyDeferred?: Promise<PickerResult | null>;
		openHistoryPicker?: PiHistoryDependencies["openHistoryPicker"];
		timers?: FakeTimers;
	} = {},
) {
	const handlers = new Map<string, EventHandler[]>();
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: ExtensionContext) => Promise<void> | void }
	>();
	const notifications: Array<{ message: string; type?: string }> = [];
	const notificationWidgetSnapshots: unknown[] = [];
	const widgets: Array<unknown> = [];
	const store = options.store ?? new FakeStore();
	const timers = options.timers ?? new FakeTimers();
	const editors: FakeEditor[] = [];
	let configuredFactory = options.baseFactory;
	let configuredWidget: unknown;
	let fallbackEditorText = "";
	const ui = {
		setEditorComponent(factory: EditorFactory | undefined) {
			configuredFactory = factory;
		},
		getEditorComponent() {
			return configuredFactory;
		},
		getEditorText() {
			return fallbackEditorText;
		},
		setEditorText(text: string) {
			fallbackEditorText = text;
		},
		notify(message: string, type?: string) {
			notifications.push({ message, type });
			notificationWidgetSnapshots.push(configuredWidget);
		},
		setWidget(_key: string, value: unknown) {
			configuredWidget = value;
			widgets.push(value);
		},
		theme: {
			fg: (_color: string, text: string) => text,
			bg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		} as Theme,
	};
	const ctx = {
		mode: options.mode ?? "tui",
		cwd: "/repo",
		ui,
		sessionManager: {
			getBranch: () =>
				options.branch ?? [
					{
						type: "message",
						id: "branch-user",
						message: { role: "user", content: "previous prompt", timestamp: 1 },
					},
				],
			getEntries: () => [],
			getSessionFile: () => "/sessions/current.jsonl",
			getSessionName: () => "Current",
			getSessionId: () => "session-id",
			getCwd: () => "/repo",
		},
	} as unknown as ExtensionContext;
	const pi = {
		on(event: string, handler: EventHandler) {
			const registered = handlers.get(event) ?? [];
			registered.push(handler);
			handlers.set(event, registered);
		},
		registerCommand(
			name: string,
			command: {
				handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
			},
		) {
			commands.set(name, command);
		},
	} as unknown as ExtensionAPI;

	const stashResults = [...(options.stashResults ?? [])];
	const stashPickerWidgets: unknown[] = [];
	const stashPickerCounts: number[] = [];
	const historyResults = [...(options.historyResults ?? [])];
	const openStashPicker =
		options.openStashPicker ??
		(options.stashDeferred
			? async () => options.stashDeferred!
			: async () => stashResults.shift() ?? null);
	const dependencies = {
		createStore: () => store,
		openStashPicker: async (
			pickerCtx: ExtensionContext,
			items: readonly PromptItem[],
			selected?: PromptItem["id"],
			signal?: AbortSignal,
		) => {
			stashPickerWidgets.push(configuredWidget);
			stashPickerCounts.push(items.length);
			return openStashPicker(pickerCtx, items, selected, signal);
		},
		openHistoryPicker:
			options.openHistoryPicker ??
			(options.historyDeferred
				? async () => options.historyDeferred!
				: async () => historyResults.shift() ?? null),
		timers: timers.dependencies,
	} as PiHistoryDependencies;
	piHistory(pi, dependencies);

	return {
		ctx,
		handlers,
		commands,
		notifications,
		notificationWidgetSnapshots,
		widgets,
		stashPickerWidgets,
		stashPickerCounts,
		store,
		timers,
		ui,
		getFactory: () => configuredFactory,
		getWidget: () => configuredWidget,
		createWidget(theme: Theme = ui.theme) {
			return instantiateWidget(configuredWidget, theme);
		},
		renderWidget(width: number, theme: Theme = ui.theme) {
			return instantiateWidget(configuredWidget, theme)?.render(width);
		},
		createEditor(mode?: VimMode) {
			const factory = configuredFactory;
			assert.ok(factory);
			const editor = factory(
				{ requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
				{ borderColor: (text: string) => text, selectList: {} } as EditorTheme,
				new KeybindingsManager(),
			) as FakeEditor;
			if (mode) editor.vimState = { mode };
			editors.push(editor);
			return editor;
		},
	};
}

async function emit(
	handlers: Map<string, EventHandler[]>,
	event: string,
	...args: unknown[]
): Promise<void> {
	for (const handler of handlers.get(event) ?? []) {
		await handler(...args);
	}
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve));
}

test("registers only /history and installs lifecycle-owned editor behavior", async () => {
	const baseEditor = new FakeEditor();
	const baseFactory: EditorFactory = () => baseEditor;
	const harness = createHarness({ baseFactory });
	assert.deepEqual([...harness.commands.keys()], ["history"]);

	await emit(harness.handlers, "session_start", {}, harness.ctx);
	assert.deepEqual(harness.store.refreshes, ["/repo"]);
	assert.ok(harness.widgets.length > 0);

	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const ownedFactory = harness.getFactory();
	assert.notStrictEqual(ownedFactory, baseFactory);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	assert.strictEqual(harness.getFactory(), ownedFactory);

	const editor = harness.createEditor();
	assert.strictEqual(editor, baseEditor);
	assert.deepEqual(editor.history, ["previous prompt"]);

	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	assert.strictEqual(harness.getFactory(), baseFactory);
	assert.equal(harness.widgets.at(-1), undefined);
	assert.equal(harness.store.closed, true);
});

test("stash widget is a responsive three-line live-theme panel with a sanitized latest preview", async () => {
	const store = new FakeStore();
	store.stashes = [
		stash(
			2,
			"\u001b[31m世界🙂 latest\nstash preview that must visibly truncate\u001b[0m",
		),
		stash(1, "older stash"),
	];
	const harness = createHarness({ store });
	await emit(harness.handlers, "session_start", {}, harness.ctx);

	const palette = { fg: 31, bg: 41, bold: 1 };
	const { theme, calls } = recordingTheme(palette);
	const component = harness.createWidget(theme);
	assert.ok(component);

	for (const width of [0, 1, 2, 12, 52]) {
		const lines = component.render(width);
		assert.equal(lines.length, 3);
		for (const line of lines) {
			assert.ok(
				visibleWidth(line) <= width,
				`${visibleWidth(line)} exceeds ${width}: ${line}`,
			);
		}
		if (width >= 3) {
			for (const line of lines) {
				const plain = stripTerminalSequences(line);
				if (!plain) continue;
				assert.equal(plain[0], " ");
				assert.equal(plain.at(-1), " ");
			}
		}
	}

	const normal = component.render(52).map(stripTerminalSequences);
	assert.match(normal[0] ?? "", /Prompt stash.*2 saved/);
	assert.match(normal[1] ?? "", /世界🙂 latest stash preview/);
	assert.doesNotMatch(normal.join("\n"), /older stash/);
	assert.ok(
		calls.some(
			(call) =>
				call.kind === "fg" &&
				call.token === "muted" &&
				call.text === "2 saved",
		),
	);

	const narrow = component.render(16).map(stripTerminalSequences);
	assert.match(narrow[1] ?? "", /…/);
	assert.doesNotMatch(narrow.join("\n"), /\u001b|\n.*stash preview/);

	const firstThemeRender = component.render(52);
	palette.fg = 32;
	palette.bold = 2;
	component.invalidate();
	const liveThemeRender = component.render(52);
	assert.notDeepEqual(liveThemeRender, firstThemeRender);
	assert.ok(firstThemeRender.some((line) => line.includes("\u001b[31m")));
	assert.ok(liveThemeRender.some((line) => line.includes("\u001b[32m")));
});

test("stash widget shows the single saved prompt preview", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "only\nstash")];
	const harness = createHarness({ store });
	await emit(harness.handlers, "session_start", {}, harness.ctx);

	const plain = (harness.renderWidget(44) ?? []).map(stripTerminalSequences);
	assert.equal(plain.length, 3);
	assert.match(plain[0] ?? "", /Prompt stash.*1 saved/);
	assert.match(plain[1] ?? "", /only stash/);
});

test("ctrl+s stashes exact drafts, handles empty and direct-pop branches, and updates widgets", async () => {
	const harness = createHarness({
		baseFactory: () => new FakeEditor(),
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor = harness.createEditor();

	editor.text = " multiline\n draft ";
	editor.handleInput("\x13");
	await settle();
	assert.deepEqual(harness.store.inserted[0], {
		text: " multiline\n draft ",
		cwd: "/repo",
	});
	assert.equal(editor.text, "");
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);
	assert.match(
		(harness.renderWidget(52) ?? []).map(stripTerminalSequences).join("\n"),
		/1 saved[\s\S]*Stashed.*multiline draft/,
	);
	assert.equal(harness.timers.activeCount, 1);
	harness.timers.advanceBy(3_000);
	assert.match(
		(harness.renderWidget(52) ?? []).map(stripTerminalSequences).join("\n"),
		/1 saved[\s\S]*multiline draft/,
	);
	assert.doesNotMatch(
		(harness.renderWidget(52) ?? []).map(stripTerminalSequences).join("\n"),
		/Stashed/,
	);

	editor.handleInput("\x13");
	await settle();
	assert.equal(editor.text, " multiline\n draft ");
	assert.deepEqual(harness.store.stashes, []);
	assert.match(
		(harness.renderWidget(52) ?? []).map(stripTerminalSequences).join("\n"),
		/0 saved[\s\S]*Popped.*multiline draft/,
	);
	assert.equal(harness.timers.activeCount, 1);
	harness.timers.advanceBy(3_000);
	assert.equal(harness.getWidget(), undefined);

	editor.text = "";
	editor.handleInput("\x13");
	await settle();
	assert.match(
		(harness.renderWidget(52) ?? []).map(stripTerminalSequences).join("\n"),
		/0 saved[\s\S]*No stashes/,
	);

	harness.store.stashes = [stash(1, "restored")];
	editor.handleInput("\x13");
	await settle();
	assert.equal(editor.text, "restored");
	assert.deepEqual(harness.store.stashes, []);
	assert.match(
		(harness.renderWidget(52) ?? []).map(stripTerminalSequences).join("\n"),
		/0 saved[\s\S]*Popped.*restored/,
	);
	assert.equal(harness.timers.activeCount, 1);
	assert.ok(harness.timers.cleared >= 1);
	harness.timers.advanceBy(3_000);
	assert.equal(harness.getWidget(), undefined);
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);
});

test("ctrl+s stashes and restores collapsed bracketed pastes exactly", async () => {
	const harness = createHarness();
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor: EditorComponent = harness.createEditor();
	assert.ok(editor instanceof CustomEditor);

	const multiline = Array.from({ length: 12 }, (_, i) => ` line ${i} `).join("\n");
	const longLine = "x".repeat(1001);
	const expected = ` before ${multiline} between ${longLine} after \n`;
	editor.handleInput(" before ");
	editor.handleInput(`\x1b[200~${multiline}\x1b[201~`);
	editor.handleInput(" between ");
	editor.handleInput(`\x1b[200~${longLine}\x1b[201~`);
	editor.insertTextAtCursor(" after \n");
	assert.match(editor.getText(), /\[paste #1 \+12 lines\]/);
	assert.match(editor.getText(), /\[paste #2 1001 chars\]/);
	assert.equal(editor.getExpandedText(), expected);

	editor.handleInput("\x13");
	await settle();
	assert.deepEqual(harness.store.listStashes("/repo").map((item) => item.text), [
		expected,
	]);
	assert.equal(editor.getExpandedText(), "");

	editor.handleInput("\x13");
	await settle();
	assert.equal(editor.getText(), expected);
	assert.equal(editor.getExpandedText(), expected);
	assert.deepEqual(harness.store.listStashes("/repo"), []);
});

test("newer routine feedback replaces the prior widget state and timer", async () => {
	const store = new FakeStore();
	const replacement = history("replacement", "replacement prompt");
	store.history = [replacement];
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		historyResults: [{ item: replacement, action: "apply" }],
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor = harness.createEditor();

	editor.text = "saved draft";
	editor.handleInput("\x13");
	await settle();
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/Stashed.*saved draft/,
	);
	assert.equal(harness.timers.activeCount, 1);

	await harness.commands.get("history")!.handler("", harness.ctx);
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/Applied.*replacement prompt/,
	);
	assert.doesNotMatch(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/Stashed/,
	);
	assert.equal(harness.timers.activeCount, 1);
	assert.equal(harness.timers.cleared, 1);

	harness.timers.advanceBy(3_000);
	const restored = (harness.renderWidget(80) ?? [])
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(restored, /Prompt stash.*1 saved[\s\S]*saved draft/);
	assert.doesNotMatch(restored, /Applied|Stashed/);
});

test("stash picker hides the compact widget and restores it after cancel", async () => {
	const store = new FakeStore();
	store.stashes = [stash(2, "newest"), stash(1, "oldest")];
	let resolvePicker: ((result: PickerResult | null) => void) | undefined;
	const stashDeferred = new Promise<PickerResult | null>((resolve) => {
		resolvePicker = resolve;
	});
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		stashDeferred,
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	assert.match(
		(harness.renderWidget(60) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*2 saved[\s\S]*newest/,
	);

	harness.createEditor().handleInput("\x13");
	await settle();
	assert.equal(harness.stashPickerWidgets[0], undefined);
	assert.deepEqual(harness.stashPickerCounts, [2]);
	assert.equal(harness.getWidget(), undefined);

	resolvePicker?.(null);
	await settle();
	assert.match(
		(harness.renderWidget(60) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*2 saved[\s\S]*newest/,
	);
});

test("history picker hides the compact widget and restores it after cancel", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "saved draft")];
	store.history = [history("history", "history prompt")];
	let resolvePicker: ((result: PickerResult | null) => void) | undefined;
	const historyDeferred = new Promise<PickerResult | null>((resolve) => {
		resolvePicker = resolve;
	});
	const harness = createHarness({
		store,
		historyDeferred,
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	assert.match(
		(harness.renderWidget(60) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*1 saved[\s\S]*saved draft/u,
	);

	const action = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.equal(harness.getWidget(), undefined);

	store.stashes = [stash(2, "new latest draft")];
	resolvePicker?.(null);
	await action;
	assert.match(
		(harness.renderWidget(60) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*1 saved[\s\S]*new latest draft/u,
	);
});

test("history picker rejection restores the widget before reporting the error", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "saved draft")];
	store.history = [history("history", "history prompt")];
	const harness = createHarness({
		store,
		openHistoryPicker: async () => {
			throw new Error("history picker failed");
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);

	await harness.commands.get("history")!.handler("", harness.ctx);

	assert.match(
		(harness.renderWidget(60) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*1 saved[\s\S]*saved draft/u,
	);
	assert.equal(
		typeof harness.notificationWidgetSnapshots.at(-1),
		"function",
	);
	assert.match(
		harness.notifications.at(-1)?.message ?? "",
		/history picker failed/u,
	);
});

test("terminal no-history feedback waits for history close before its full timer", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "saved draft")];
	store.state = { active: true, warnings: [], productive: false };
	let terminalEmptyChange:
		| ((terminalEmpty: boolean) => void)
		| undefined;
	let resolvePicker: ((result: PickerResult | null) => void) | undefined;
	const pickerResult = new Promise<PickerResult | null>((resolve) => {
		resolvePicker = resolve;
	});
	const harness = createHarness({
		store,
		openHistoryPicker: async (
			_ctx,
			_query,
			_index,
			onTerminalEmptyChange,
		) => {
			terminalEmptyChange = onTerminalEmptyChange;
			return pickerResult;
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);

	const action = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.equal(harness.getWidget(), undefined);
	assert.equal(harness.timers.activeCount, 0);

	terminalEmptyChange?.(true);
	assert.equal(harness.getWidget(), undefined);
	assert.equal(harness.timers.activeCount, 0);
	harness.timers.advanceBy(3_000);
	assert.equal(harness.getWidget(), undefined);

	resolvePicker?.(null);
	await action;
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/No prompt history found/u,
	);
	assert.equal(harness.timers.activeCount, 1);

	harness.timers.advanceBy(2_999);
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/No prompt history found/u,
	);
	harness.timers.advanceBy(1);
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*1 saved[\s\S]*saved draft/u,
	);
});

test("terminal no-history recovery clears deferred feedback before close", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "saved draft")];
	store.state = { active: true, warnings: [], productive: false };
	let terminalEmptyChange:
		| ((terminalEmpty: boolean) => void)
		| undefined;
	let resolvePicker: ((result: PickerResult | null) => void) | undefined;
	const pickerResult = new Promise<PickerResult | null>((resolve) => {
		resolvePicker = resolve;
	});
	const harness = createHarness({
		store,
		openHistoryPicker: async (
			_ctx,
			_query,
			_index,
			onTerminalEmptyChange,
		) => {
			terminalEmptyChange = onTerminalEmptyChange;
			return pickerResult;
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);

	const action = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	terminalEmptyChange?.(true);
	terminalEmptyChange?.(false);
	resolvePicker?.(null);
	await action;

	const rendered = (harness.renderWidget(80) ?? [])
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(rendered, /Prompt stash.*1 saved[\s\S]*saved draft/u);
	assert.doesNotMatch(rendered, /No prompt history found/u);
	assert.equal(harness.timers.activeCount, 0);
});

test("stash picker rejection restores the widget before reporting the error", async () => {
	const store = new FakeStore();
	store.stashes = [stash(2, "newest"), stash(1, "oldest")];
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		openStashPicker: async () => {
			throw new Error("picker failed");
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);

	harness.createEditor().handleInput("\x13");
	await settle();
	assert.equal(harness.stashPickerWidgets[0], undefined);
	assert.match(
		(harness.renderWidget(60) ?? []).map(stripTerminalSequences).join("\n"),
		/Prompt stash.*2 saved[\s\S]*newest/,
	);
	assert.match(harness.notifications.at(-1)?.message ?? "", /picker failed/);
});

test("shutdown cannot restore a widget from a pending stash picker", async () => {
	const store = new FakeStore();
	store.stashes = [stash(2, "newest"), stash(1, "oldest")];
	let resolvePicker: ((result: PickerResult | null) => void) | undefined;
	const stashDeferred = new Promise<PickerResult | null>((resolve) => {
		resolvePicker = resolve;
	});
	let pickerSignal: AbortSignal | undefined;
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		openStashPicker: async (_ctx, _items, _selected, signal) => {
			pickerSignal = signal;
			return stashDeferred;
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	harness.createEditor().handleInput("\x13");
	await settle();
	assert.equal(harness.getWidget(), undefined);

	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	assert.equal(pickerSignal?.aborted, true);
	const updatesAfterShutdown = harness.widgets.length;
	resolvePicker?.(null);
	await settle();
	assert.equal(harness.widgets.length, updatesAfterShutdown);
	assert.equal(harness.getWidget(), undefined);
});

test("terminal no-history feedback uses the widget without an info notification", async () => {
	const store = new FakeStore();
	store.state = { active: true, warnings: [], productive: false };
	const harness = createHarness({
		store,
		openHistoryPicker: async (
			_ctx,
			_query,
			_index,
			onTerminalEmptyChange,
		) => {
			onTerminalEmptyChange?.(true);
			return null;
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await harness.commands.get("history")!.handler("", harness.ctx);

	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/0 saved[\s\S]*No prompt history found/,
	);
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);
});

test("shutdown clears feedback timers and rejects late history callbacks", async () => {
	const store = new FakeStore();
	store.state = { active: true, warnings: [], productive: false };
	let terminalEmptyChange:
		| ((terminalEmpty: boolean) => void)
		| undefined;
	let pickerSignal: AbortSignal | undefined;
	let resolvePicker: ((result: PickerResult | null) => void) | undefined;
	const pickerResult = new Promise<PickerResult | null>((resolve) => {
		resolvePicker = resolve;
	});
	const harness = createHarness({
		store,
		openHistoryPicker: async (
			_ctx,
			_query,
			_index,
			onTerminalEmptyChange,
			signal,
		) => {
			terminalEmptyChange = onTerminalEmptyChange;
			pickerSignal = signal;
			return pickerResult;
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	harness.createEditor().handleInput("\x13");
	await settle();
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/No stashes/,
	);
	assert.equal(harness.timers.activeCount, 1);

	const stashless = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.ok(terminalEmptyChange);

	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	assert.equal(pickerSignal?.aborted, true);
	assert.equal(harness.timers.activeCount, 0);
	assert.equal(harness.getWidget(), undefined);
	const updatesAfterShutdown = harness.widgets.length;

	harness.timers.advanceBy(3_000);
	terminalEmptyChange?.(true);
	assert.equal(harness.widgets.length, updatesAfterShutdown);
	assert.equal(harness.getWidget(), undefined);

	resolvePicker?.(null);
	await stashless;
});

test("late prior-session picker finalization cannot release the current picker lifecycle", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "saved draft")];
	store.history = [history("history", "history prompt")];
	const resolvers: Array<(result: PickerResult | null) => void> = [];
	const terminalCallbacks: Array<
		((terminalEmpty: boolean) => void) | undefined
	> = [];
	let pickerCalls = 0;
	const harness = createHarness({
		store,
		openHistoryPicker: async (
			_ctx,
			_query,
			_index,
			onTerminalEmptyChange,
		) => {
			pickerCalls += 1;
			terminalCallbacks.push(onTerminalEmptyChange);
			return new Promise<PickerResult | null>((resolve) => {
				resolvers.push(resolve);
			});
		},
	});

	await emit(harness.handlers, "session_start", {}, harness.ctx);
	const first = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.equal(pickerCalls, 1);

	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	const second = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.equal(pickerCalls, 2);
	assert.equal(harness.getWidget(), undefined);

	resolvers[0]?.({ item: store.history[0]!, action: "apply" });
	await first;
	assert.equal(harness.ui.getEditorText(), "");
	terminalCallbacks[1]?.(true);
	assert.equal(harness.getWidget(), undefined);

	const reentry = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.equal(pickerCalls, 2);
	assert.match(
		harness.notifications.at(-1)?.message ?? "",
		/already in progress/u,
	);

	resolvers[1]?.(null);
	await Promise.all([second, reentry]);
});

test("late prior-session picker rejection cannot notify the replacement session", async () => {
	const store = new FakeStore();
	store.history = [history("history", "history prompt")];
	let rejectPicker: ((error: Error) => void) | undefined;
	const harness = createHarness({
		store,
		openHistoryPicker: async () =>
			new Promise<PickerResult | null>((_resolve, reject) => {
				rejectPicker = reject;
			}),
	});

	await emit(harness.handlers, "session_start", {}, harness.ctx);
	const priorSession = harness.commands
		.get("history")!
		.handler("", harness.ctx);
	await settle();

	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	const notificationCount = harness.notifications.length;

	rejectPicker?.(new Error("stale picker failure"));
	await priorSession;
	assert.equal(harness.notifications.length, notificationCount);
});

test("stash picker supports drop then apply and auto-stashes displaced drafts", async () => {
	const store = new FakeStore();
	store.stashes = [stash(3, "third"), stash(2, "second"), stash(1, "first")];
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		stashResults: [
			{
				item: store.stashes[1]!,
				action: "drop",
				selectionAfterDrop: 3,
			},
			{ item: store.stashes[0]!, action: "apply" },
		],
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor = harness.createEditor();
	editor.handleInput("\x13");
	await settle();
	await settle();
	assert.equal(editor.text, "third");
	assert.equal(
		store.stashes.some((item) => item.id === 2),
		false,
	);
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);
	assert.equal(
		harness.stashPickerWidgets.every((widget) => widget === undefined),
		true,
	);
	assert.deepEqual(harness.stashPickerCounts, [3, 2]);
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/Applied.*third/,
	);

	const autoStore = new FakeStore();
	autoStore.history = [history("picked-history", "replacement")];
	const autoEditor = new FakeEditor();
	const historyAuto = createHarness({
		store: autoStore,
		baseFactory: () => autoEditor,
		historyResults: [{ item: autoStore.history[0]!, action: "apply" }],
	});
	await emit(historyAuto.handlers, "session_start", {}, historyAuto.ctx);
	await emit(historyAuto.handlers, "resources_discover", {}, historyAuto.ctx);
	historyAuto.createEditor();
	autoEditor.text = "current draft";
	await historyAuto.commands.get("history")?.handler("", historyAuto.ctx);
	assert.equal(autoEditor.text, "replacement");
	assert.ok(autoStore.stashes.some((item) => item.text === "current draft"));
	assert.match(
		(historyAuto.renderWidget(90) ?? [])
			.map(stripTerminalSequences)
			.join("\n"),
		/1 saved[\s\S]*Applied.*replacement.*current draft auto-stashed/,
	);
	assert.equal(
		historyAuto.notifications.some(
			(notification) => notification.type === "info",
		),
		false,
	);
});

test("drop feedback starts its full timer after the picker closes", async () => {
	const store = new FakeStore();
	const newest = stash(3, "newest");
	const dropped = stash(2, "dropped");
	const oldest = stash(1, "oldest");
	store.stashes = [newest, dropped, oldest];
	let resolveSecond: ((result: PickerResult | null) => void) | undefined;
	const secondResult = new Promise<PickerResult | null>((resolve) => {
		resolveSecond = resolve;
	});
	let pickerCalls = 0;
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		openStashPicker: async () => {
			pickerCalls += 1;
			if (pickerCalls === 1) {
				return {
					item: dropped,
					action: "drop",
					selectionAfterDrop: newest.id,
				};
			}
			return secondResult;
		},
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);

	harness.createEditor().handleInput("\x13");
	await settle();
	await settle();
	assert.equal(pickerCalls, 2);
	assert.equal(store.stashes.some((item) => item.id === dropped.id), false);
	assert.equal(harness.timers.activeCount, 0);

	harness.timers.advanceBy(3_000);
	resolveSecond?.(null);
	await settle();
	const feedback = (harness.renderWidget(80) ?? [])
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(feedback, /Dropped.*dropped/);
	assert.equal(harness.timers.activeCount, 1);

	harness.timers.advanceBy(2_999);
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/Dropped.*dropped/,
	);
	harness.timers.advanceBy(1);
	const restored = (harness.renderWidget(80) ?? [])
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(restored, /Prompt stash.*2 saved[\s\S]*newest/);
	assert.doesNotMatch(restored, /Dropped/);
});

test("dropping the final picker stash refreshes once per mutation and removes the widget", async () => {
	const store = new FakeStore();
	const newest = stash(2, "newest");
	const oldest = stash(1, "oldest");
	store.stashes = [newest, oldest];
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		stashResults: [
			{
				item: oldest,
				action: "drop",
				selectionAfterDrop: newest.id,
			},
			{ item: newest, action: "drop" },
		],
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const widgetUpdatesBefore = harness.widgets.length;

	harness.createEditor().handleInput("\x13");
	await settle();
	await settle();

	assert.deepEqual(store.stashes, []);
	assert.equal(harness.widgets.length, widgetUpdatesBefore + 2);
	assert.equal(
		harness.stashPickerWidgets.every((widget) => widget === undefined),
		true,
	);
	assert.deepEqual(harness.stashPickerCounts, [2, 1]);
	assert.match(
		(harness.renderWidget(40) ?? []).map(stripTerminalSequences).join("\n"),
		/0 saved[\s\S]*Dropped.*newest/,
	);
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);
	harness.timers.advanceBy(3_000);
	assert.equal(harness.getWidget(), undefined);
});

test("/history auto-stashes collapsed bracketed pastes and preserves them on mutation failure", async () => {
	const store = new FakeStore();
	const replacement = history("picked-history", "replacement");
	store.history = [replacement];
	const harness = createHarness({
		store,
		historyResults: [
			{ item: replacement, action: "apply" },
			{ item: replacement, action: "apply" },
		],
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor: EditorComponent = harness.createEditor();
	assert.ok(editor instanceof CustomEditor);

	const draft = `  ${Array.from({ length: 12 }, (_, i) => `draft line ${i}`).join("\n")} \n`;
	editor.handleInput(`\x1b[200~${draft}\x1b[201~`);
	const collapsed = editor.getText();
	assert.match(collapsed, /\[paste #1 \+\d+ lines\]/);
	assert.equal(editor.getExpandedText(), draft);

	store.failMutation = true;
	await harness.commands.get("history")!.handler("", harness.ctx);
	assert.equal(editor.getText(), collapsed);
	assert.equal(editor.getExpandedText(), draft);
	assert.deepEqual(store.listStashes("/repo"), []);
	assert.match(harness.notifications.at(-1)?.message ?? "", /mutation failed/);

	store.failMutation = false;
	await harness.commands.get("history")!.handler("", harness.ctx);
	assert.equal(editor.getExpandedText(), replacement.text);
	assert.deepEqual(store.listStashes("/repo").map((item) => item.text), [draft]);
	assert.match(
		(harness.renderWidget(100) ?? []).map(stripTerminalSequences).join("\n"),
		/Applied.*replacement.*current draft auto-stashed/,
	);

	editor.setText("");
	editor.handleInput("\x13");
	await settle();
	assert.equal(editor.getExpandedText(), draft);
	assert.deepEqual(store.listStashes("/repo"), []);
});

test("storage failures preserve editor contents", async () => {
	const store = new FakeStore();
	store.failInsert = true;
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor = harness.createEditor();
	editor.text = "must remain";
	editor.handleInput("\x13");
	await settle();
	assert.equal(editor.text, "must remain");
	assert.match(harness.notifications.at(-1)?.message ?? "", /insert failed/);

	store.failInsert = false;
	store.failMutation = true;
	store.history = [history("h", "replacement")];
	const apply = createHarness({
		store,
		baseFactory: () => editor,
		historyResults: [{ item: store.history[0]!, action: "apply" }],
	});
	await emit(apply.handlers, "session_start", {}, apply.ctx);
	await emit(apply.handlers, "resources_discover", {}, apply.ctx);
	editor.text = "still here";
	await apply.commands.get("history")?.handler("", apply.ctx);
	assert.equal(editor.text, "still here");
	assert.match(apply.notifications.at(-1)?.message ?? "", /mutation failed/);
});

test("widget feedback and notifications sanitize persisted prompt data and indexing warnings", async () => {
	const store = new FakeStore();
	store.stashes = [stash(1, "restored\u001b[2J\u0007\nprompt")];
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor = harness.createEditor();

	editor.handleInput("\x13");
	await settle();
	assert.equal(editor.text, "restored\u001b[2J\u0007\nprompt");
	const feedback = (harness.renderWidget(80) ?? [])
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(feedback, /Popped.*restored prompt/);
	assert.equal(feedback.includes("\u001b"), false);
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);

	store.emitState({
		active: false,
		warnings: ["Could not index /tmp/\u001b[2Jbad\u0007\nsession"],
		productive: false,
	});
	assert.equal(
		harness.notifications.at(-1)?.message,
		"pi-history: Could not index /tmp/bad session",
	);
});

test("/history and eligible ctrl+r share behavior while Vim non-insert modes delegate", async () => {
	const modes: Array<VimMode | undefined> = [
		undefined,
		"insert",
		"replace",
		"normal",
		"visual",
		"visual-line",
		"command-line",
	];
	for (const mode of modes) {
		const store = new FakeStore();
		store.history = [history(`h-${mode ?? "none"}`, `text-${mode ?? "none"}`)];
		const harness = createHarness({
			store,
			baseFactory: () => new FakeEditor(),
			historyResults: [
				{ item: store.history[0]!, action: "apply" },
				{ item: store.history[0]!, action: "apply" },
			],
		});
		await emit(harness.handlers, "session_start", {}, harness.ctx);
		await emit(harness.handlers, "resources_discover", {}, harness.ctx);
		const editor = harness.createEditor(mode);

		await harness.commands.get("history")?.handler("", harness.ctx);
		assert.equal(editor.text, `text-${mode ?? "none"}`);
		assert.equal(store.refreshes.length, 2);
		editor.text = "";
		editor.handleInput("\x12");
		await settle();

		const eligible =
			mode === undefined || mode === "insert" || mode === "replace";
		assert.equal(store.refreshes.length, eligible ? 3 : 2);
		if (eligible) {
			assert.equal(editor.text, `text-${mode ?? "none"}`);
			assert.equal(editor.inputs.includes("\x12"), false);
		} else {
			assert.equal(editor.text, "");
			assert.equal(editor.inputs.includes("\x12"), true);
		}
	}
});

test("/history discovers new sibling prompts after the throttle interval without delaying an empty picker", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "pi-history-index-"));
	const sessionPath = join(root, "sibling.jsonl");
	writeFileSync(sessionPath, "");
	let now = 0;
	let listings = 0;
	let resolveListing: ((sessions: SessionListing[]) => void) | undefined;
	const listed = new Promise<SessionListing[]>((resolve) => {
		resolveListing = resolve;
	});
	const store = new PiHistoryStore({
		databasePath: ":memory:",
		now: () => now,
		listSessions: async (_cwd, onProgress) => {
			listings += 1;
			if (listings === 1) return [];
			onProgress?.(0, 1);
			return listed;
		},
		openSession: () => ({
			getEntries: () => [
				{
					type: "message",
					id: "sibling-prompt",
					message: {
						role: "user",
						content: "new sibling prompt",
						timestamp: 60_000,
					},
				},
			],
		}),
	});
	let picker: HistoryPicker | undefined;
	t.after(async () => {
		resolveListing?.([]);
		picker?.dispose();
		await store.close();
		rmSync(root, { recursive: true, force: true });
	});
	const harness = createHarness({
		store,
		openHistoryPicker: (ctx, query, index, onTerminalEmptyChange) =>
			new Promise((resolve) => {
				picker = createHistoryPicker(
					{ requestRender() {} } as TUI,
					ctx.ui.theme,
					new KeybindingsManager(),
					resolve,
					ctx.cwd,
					query,
					index,
					onTerminalEmptyChange,
				);
			}),
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await store.getRefreshPromise("/repo");
	assert.equal(listings, 1);
	assert.equal(store.getIndexState("/repo").active, false);

	await harness.commands.get("history")!.handler("", harness.ctx);
	assert.equal(listings, 1, "opening within the throttle must not relist sessions");
	assert.equal(Boolean(picker), false);
	assert.match(
		(harness.renderWidget(80) ?? []).map(stripTerminalSequences).join("\n"),
		/No prompt history found/,
	);
	assert.equal(
		harness.notifications.some((notification) => notification.type === "info"),
		false,
	);

	now = 60_000;
	const action = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.ok(picker, "the empty picker must open before session listing completes");
	assert.equal(listings, 2);
	assert.equal(picker.isTerminallyEmpty(), false);
	assert.match(picker.render(100).join("\n"), /Indexing sessions 0\/1/);
	assert.deepEqual(harness.notifications, []);

	resolveListing?.([
		{
			path: sessionPath,
			cwd: "/repo",
			modified: new Date(now),
		},
	]);
	await store.getRefreshPromise("/repo");
	assert.match(picker.render(100).join("\n"), /new sibling prompt/);
	assert.deepEqual(harness.notifications, []);
	picker.handleInput("\r");
	await action;
	assert.equal(harness.ui.getEditorText(), "new sibling prompt");

	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	assert.equal(store.isOpen(), false);
});

test("/history keeps cached results usable while refresh rejection reports a sanitized error", async () => {
	const store = new FakeStore();
	const item = history("cached", "cached prompt");
	store.history = [item];
	const harness = createHarness({
		store,
		historyResults: [{ item, action: "apply" }, { item, action: "apply" }],
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	let rejectRefresh: ((error: Error) => void) | undefined;
	const pending = new Promise<void>((_resolve, reject) => {
		rejectRefresh = reject;
	});
	store.refreshHistory = () => pending;

	const action = harness.commands.get("history")!.handler("", harness.ctx);
	await settle();
	assert.equal(harness.ui.getEditorText(), item.text);
	await action;

	rejectRefresh?.(new Error("refresh\u001b[2J failed\u0007"));
	await settle();
	assert.deepEqual(
		harness.notifications.filter((notification) => notification.type === "error"),
		[{ message: "pi-history: refresh failed", type: "error" }],
	);

	store.refreshHistory = () => Promise.resolve();
	harness.ui.setEditorText("");
	await harness.commands.get("history")!.handler("", harness.ctx);
	assert.equal(harness.ui.getEditorText(), item.text);
	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	assert.equal(store.closed, true);
});

test("non-TUI mode skips editor and picker installation but keeps /history harmless", async () => {
	const baseFactory: EditorFactory = () => new FakeEditor();
	const harness = createHarness({ mode: "print", baseFactory });
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	assert.strictEqual(harness.getFactory(), baseFactory);
	await harness.commands.get("history")?.handler("", harness.ctx);
	assert.deepEqual(harness.store.refreshes, ["/repo"]);
	assert.match(
		harness.notifications.at(-1)?.message ?? "",
		/only available in TUI mode/,
	);
});

test("concurrent picker actions are guarded", async () => {
	let resolveHistory: ((value: PickerResult | null) => void) | undefined;
	const pending = new Promise<PickerResult | null>((resolve) => {
		resolveHistory = resolve;
	});
	const store = new FakeStore();
	store.history = [history("h", "history")];
	const harness = createHarness({
		store,
		baseFactory: () => new FakeEditor(),
		historyDeferred: pending,
	});
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	const editor = harness.createEditor();
	editor.handleInput("\x12");
	editor.handleInput("\x12");
	await settle();
	assert.match(
		harness.notifications.at(-1)?.message ?? "",
		/already in progress/,
	);
	assert.equal(store.refreshes.length, 2);
	resolveHistory?.(null);
	await pending;
	await settle();
});

test("shutdown restores only an editor layer it still owns", async () => {
	const baseFactory: EditorFactory = () => new FakeEditor();
	const replacement: EditorFactory = () => new FakeEditor();
	const harness = createHarness({ baseFactory });
	await emit(harness.handlers, "session_start", {}, harness.ctx);
	await emit(harness.handlers, "resources_discover", {}, harness.ctx);
	harness.ui.setEditorComponent(replacement);
	await emit(harness.handlers, "session_shutdown", {}, harness.ctx);
	assert.strictEqual(harness.getFactory(), replacement);
});

test("real pi-tui-shell composition preserves pi-history shortcuts and Vim redo", async () => {
	const shellHandlers = new Map<string, EventHandler[]>();
	const historyHandlers = new Map<string, EventHandler[]>();
	const commands = new Map<string, unknown>();
	let configuredFactory: EditorFactory | undefined;
	const leaf = new FakeEditor();
	leaf.vimState = { mode: "normal" };
	const ui = {
		setEditorComponent(factory: EditorFactory | undefined) {
			configuredFactory = factory;
		},
		getEditorComponent: () => configuredFactory,
		setWorkingVisible() {},
		setFooter() {},
		setWidget() {},
		notify() {},
		getEditorText: () => leaf.text,
		setEditorText: (text: string) => {
			leaf.text = text;
		},
		theme: {
			fg: (_color: string, text: string) => text,
			bg: (_color: string, text: string) => text,
			bold: (text: string) => text,
			getBgAnsi: () => "",
			getThinkingBorderColor: () => (text: string) => text,
		},
	};
	const ctx = {
		mode: "tui",
		cwd: "/repo",
		ui,
		model: undefined,
		getContextUsage: () => undefined,
		sessionManager: {
			getCwd: () => "/repo",
			getEntries: () => [],
			getBranch: () => [],
			getSessionFile: () => "/sessions/current.jsonl",
			getSessionName: () => undefined,
			getSessionId: () => "id",
		},
	} as unknown as ExtensionContext;
	const shellPi = {
		on(event: string, handler: EventHandler) {
			const list = shellHandlers.get(event) ?? [];
			list.push(handler);
			shellHandlers.set(event, list);
		},
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI;
	const store = new FakeStore();
	store.history = [history("h", "from history")];
	const timers = new FakeTimers();
	const historyPi = {
		on(event: string, handler: EventHandler) {
			const list = historyHandlers.get(event) ?? [];
			list.push(handler);
			historyHandlers.set(event, list);
		},
		registerCommand(name: string, command: unknown) {
			commands.set(name, command);
		},
	} as unknown as ExtensionAPI;

	// pi-vim installs the replacing factory first.
	configuredFactory = () => leaf;
	piTuiShell(shellPi);
	piHistory(historyPi, {
		createStore: () => store,
		openStashPicker: async () => null,
		openHistoryPicker: async (_ctx, query) => ({
			item: query()[0]!,
			action: "apply",
		}),
		timers: timers.dependencies,
	});
	await emit(shellHandlers, "session_start", {}, ctx);
	await emit(historyHandlers, "session_start", {}, ctx);
	await emit(historyHandlers, "resources_discover", {}, ctx);
	await emit(shellHandlers, "resources_discover", {}, ctx);

	const factory = configuredFactory;
	assert.ok(factory);
	const composed = factory(
		{ requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
		{ borderColor: (text: string) => text, selectList: {} } as EditorTheme,
		{} as KeybindingsManager,
	);

	composed.handleInput("\x12");
	await settle();
	assert.equal(leaf.inputs.includes("\x12"), true);
	assert.equal(leaf.text, "");

	leaf.vimState.mode = "insert";
	composed.handleInput("\x12");
	await settle();
	assert.equal(leaf.text, "from history");
});
