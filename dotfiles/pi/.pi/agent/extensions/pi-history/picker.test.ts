import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	CURSOR_MARKER,
	stripTerminalSequences,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	HISTORY_RESULT_LIMIT,
	type PickerResult,
	type PromptItem,
} from "./model.ts";
import {
	createHistoryPicker,
	createStashPicker,
	type HistoryIndexView,
	type HistoryPicker,
	openHistoryPicker,
	openStashPicker,
	PI_HISTORY_WIDGET_KEY,
	PromptPicker,
	type StashPicker,
} from "./picker.ts";
import type { IndexState } from "./store.ts";

function stash(id: number, text: string, cwd = "/repo"): PromptItem {
	return { kind: "stash", id, text, cwd, timestamp: id };
}

function formattedDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function history(
	id: string,
	text: string,
	timestamp: number,
	options: {
		sessionPath?: string;
		sessionName?: string;
		cwd?: string;
		hasImages?: boolean;
	} = {},
): PromptItem {
	return {
		kind: "history",
		id,
		text,
		timestamp,
		cwd: options.cwd ?? "/repo",
		sessionPath: options.sessionPath ?? `/sessions/${id}.jsonl`,
		sessionName: options.sessionName,
		hasImages: options.hasImages,
	};
}

function theme(prefix = ""): Theme {
	return {
		fg: (_color: string, text: string) => `${prefix}${text}`,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
}

function keybindings(
	bindings: Record<string, string[]> = {
		"tui.select.up": ["up"],
		"tui.select.down": ["down"],
		"tui.select.pageUp": ["pageUp"],
		"tui.select.pageDown": ["pageDown"],
		"tui.select.confirm": ["enter"],
		"tui.select.cancel": ["escape", "ctrl+c"],
	},
): KeybindingsManager {
	return {
		matches(data: string, id: string) {
			return bindings[id]?.includes(data) ?? false;
		},
	} as KeybindingsManager;
}

function createHarness(
	items = [stash(3, "third"), stash(2, "second"), stash(1, "first")],
	bindings?: Record<string, string[]>,
	selected?: PromptItem["id"],
	cwd = "/repo",
) {
	const results: Array<PickerResult | null> = [];
	let renders = 0;
	const tui = {
		requestRender() {
			renders += 1;
		},
	} as TUI;
	const picker = createStashPicker(
		tui,
		theme(),
		keybindings(bindings),
		(result) => results.push(result),
		cwd,
		items,
		selected,
	);
	return { picker, results, getRenders: () => renders };
}

function assertLinesFit(lines: string[], width: number): void {
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= width,
			`line width ${visibleWidth(line)} exceeds ${width}: ${line}`,
		);
	}
}

function assertNoTerminalControls(lines: string[]): void {
	const rendered = lines.join("");
	assert.equal(rendered.includes("\u001b[2J"), false);
	assert.equal(rendered.includes("\u001b]52"), false);
	const plain = stripTerminalSequences(rendered);
	assert.equal(plain.includes("\u0007"), false);
	assert.equal(
		Array.from(plain).some((character) => {
			const code = character.codePointAt(0) ?? -1;
			return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
		}),
		false,
	);
}

test("stash picker renders above the editor with a zero-line focus controller", async () => {
	const widgetUpdates: Array<{
		key: string;
		value: unknown;
		options?: unknown;
	}> = [];
	let pickerWidget: Component | undefined;
	let inputController: (Component & { focused: boolean }) | undefined;
	let overlayOptions: unknown;
	let overlay = false;
	const tui = {
		requestRender() {},
		terminal: { rows: 24 },
	} as unknown as TUI;
	const ctx = {
		cwd: "/picker/scope",
		ui: {
			setWidget(key: string, value: unknown, options?: unknown) {
				widgetUpdates.push({ key, value, options });
				if (typeof value === "function") {
					pickerWidget = (
						value as (tui: TUI, theme: Theme) => Component
					)(tui, theme());
				} else {
					pickerWidget = undefined;
				}
			},
			custom(
				factory: (
					tui: TUI,
					theme: Theme,
					keys: KeybindingsManager,
					done: (result: PickerResult | null) => void,
				) => Component & { focused: boolean },
				options: { overlay?: boolean; overlayOptions?: unknown },
			) {
				overlay = options.overlay ?? false;
				overlayOptions = options.overlayOptions;
				return new Promise<PickerResult | null>((resolve) => {
					inputController = factory(tui, theme(), keybindings(), resolve);
					inputController.focused = true;
				});
			},
		},
	} as unknown as ExtensionContext;

	const controller = new AbortController();
	const result = openStashPicker(
		ctx,
		[stash(1, "one", "/row/path")],
		undefined,
		controller.signal,
	);
	assert.equal(overlay, true);
	assert.deepEqual(overlayOptions, {
		anchor: "top-left",
		width: 1,
	});
	assert.equal(widgetUpdates[0]?.key, PI_HISTORY_WIDGET_KEY);
	assert.deepEqual(widgetUpdates[0]?.options, { placement: "aboveEditor" });
	assert.ok(pickerWidget);
	const renderedPicker = pickerWidget.render(60).join("\n");
	assert.match(renderedPicker, /Prompt stash/);
	assert.match(renderedPicker, /\/picker\/scope/);
	assert.doesNotMatch(renderedPicker, /\/row\/path/);
	assert.ok(inputController);
	assert.deepEqual(inputController.render(60), []);

	controller.abort();
	controller.abort();
	inputController.handleInput?.("enter");
	assert.equal(await result, null);
	assert.equal(widgetUpdates.at(-1)?.key, PI_HISTORY_WIDGET_KEY);
	assert.equal(widgetUpdates.at(-1)?.value, undefined);
	assert.equal(
		widgetUpdates.filter((update) => update.value === undefined).length,
		1,
	);
});

test("picker host skips mounting both modes when already aborted", async () => {
	for (const mode of ["stash", "history"] as const) {
		let customCalls = 0;
		let widgetCalls = 0;
		const ctx = {
			cwd: "/repo",
			ui: {
				setWidget() {
					widgetCalls += 1;
				},
				custom() {
					customCalls += 1;
					return Promise.resolve(null);
				},
			},
		} as unknown as ExtensionContext;
		const controller = new AbortController();
		controller.abort();
		const index = createIndexHarness();
		const result =
			mode === "stash"
				? await openStashPicker(
						ctx,
						[stash(1, "one")],
						undefined,
						controller.signal,
					)
				: await openHistoryPicker(
						ctx,
						() => [history("one", "one", 1)],
						index.view,
						undefined,
						controller.signal,
					);

		assert.equal(result, null, mode);
		assert.equal(customCalls, 0, mode);
		assert.equal(widgetCalls, 0, mode);
		assert.equal(index.getSubscriberCount(), 0, mode);
	}
});

test("stash picker honors fixed controls, injected navigation, enter, and cancel", () => {
	const bindings = {
		"tui.select.up": ["custom-up"],
		"tui.select.down": ["custom-down"],
		"tui.select.pageUp": ["custom-page-up"],
		"tui.select.pageDown": ["custom-page-down"],
		"tui.select.confirm": ["custom-enter"],
		"tui.select.cancel": ["custom-cancel"],
	};
	const down = createHarness(undefined, bindings);
	down.picker.handleInput("custom-down");
	down.picker.handleInput("custom-enter");
	assert.equal(down.results[0]?.item.id, 2);
	assert.equal(down.results[0]?.action, "pop");

	const control = createHarness(undefined, bindings);
	control.picker.handleInput("\x0e");
	control.picker.handleInput("\x0e");
	control.picker.handleInput("\x10");
	control.picker.handleInput("custom-enter");
	assert.equal(control.results[0]?.item.id, 2);

	const up = createHarness(undefined, bindings);
	up.picker.handleInput("custom-up");
	up.picker.handleInput("custom-enter");
	assert.equal(up.results[0]?.item.id, 1);

	const cancelled = createHarness(undefined, bindings);
	cancelled.picker.handleInput("custom-cancel");
	assert.equal(cancelled.results[0], null);
});

test("stash picker Page Up wraps three rows before Enter", () => {
	const items = [stash(3, "third"), stash(2, "second"), stash(1, "first")];
	const harness = createHarness(items, {
		"tui.select.pageUp": ["\x1b[5~"],
		"tui.select.confirm": ["\r"],
	});
	harness.picker.handleInput("\x1b[5~");
	harness.picker.handleInput("\r");
	assert.deepEqual(harness.results, [{ item: items[2], action: "pop" }]);
});

test("stash picker Page Up wraps lists of one to four rows", () => {
	for (const [length, expectedIndex] of [
		[1, 0],
		[2, 0],
		[3, 2],
		[4, 2],
	]) {
		const items = Array.from({ length }, (_, index) =>
			stash(index + 1, `stash ${index + 1}`),
		);
		const harness = createHarness(items);
		harness.picker.handleInput("pageUp");
		harness.picker.handleInput("enter");
		assert.deepEqual(
			harness.results,
			[{ item: items[expectedIndex], action: "pop" }],
			`${length} rows`,
		);
	}
});

test("stash picker budgets rows from terminal height and pages by the visible count", () => {
	const items = Array.from({ length: 12 }, (_, index) =>
		stash(12 - index, `stash ${12 - index}`),
	);
	const results: Array<PickerResult | null> = [];
	const terminal = { rows: 16 };
	const tui = {
		requestRender() {},
		terminal,
	} as unknown as TUI;
	const picker = createStashPicker(
		tui,
		theme(),
		keybindings(),
		(result) => results.push(result),
		"/repo",
		items,
	);

	assert.equal(picker.render(80).length, 9);
	terminal.rows = 12;
	assert.equal(picker.render(80).length, 7);
	terminal.rows = 16;
	assert.equal(picker.render(80).length, 9);
	picker.handleInput("pageDown");
	picker.handleInput("enter");
	assert.equal(results[0]?.item.id, 9);

	const shortTui = {
		requestRender() {},
		terminal: { rows: 12 },
	} as unknown as TUI;
	const compact = createStashPicker(
		shortTui,
		theme(),
		keybindings(),
		() => {},
		"/repo",
		items,
	);
	assert.equal(compact.render(80).length, 7);
});

test("shared picker leaves seven terminal rows for host chrome", () => {
	const items = Array.from({ length: 12 }, (_, index) =>
		stash(12 - index, `stash ${12 - index}`),
	);
	const tui = {
		requestRender() {},
		terminal: { rows: 18 },
	} as unknown as TUI;
	const stashPicker = createStashPicker(
		tui,
		theme(),
		keybindings(),
		() => {},
		"/repo",
		items,
	);
	assert.ok(stashPicker.render(90).length <= 11);

	const historyPicker = createHistoryHarness({
		items: items.map((item) =>
			history(String(item.id), item.text, item.timestamp),
		),
		terminalRows: 18,
	});
	assert.ok(historyPicker.picker.render(90).length <= 11);
});

test("stash picker wraps repeated page navigation in both directions", () => {
	const items = [stash(3, "third"), stash(2, "second"), stash(1, "first")];
	for (const { keys, expectedIndex } of [
		{ keys: ["pageUp", "pageUp"], expectedIndex: 1 },
		{ keys: ["pageDown", "pageDown"], expectedIndex: 2 },
		{ keys: ["pageUp", "pageDown"], expectedIndex: 0 },
	]) {
		const harness = createHarness(items);
		for (const key of keys) harness.picker.handleInput(key);
		harness.picker.handleInput("enter");
		assert.deepEqual(
			harness.results,
			[{ item: items[expectedIndex], action: "pop" }],
			keys.join(", "),
		);
	}
});

test("stash picker keeps arrow and fixed-control navigation wrapping at either end", () => {
	const items = [stash(3, "third"), stash(2, "second"), stash(1, "first")];
	for (const key of ["up", "\x10", "down", "\x0e"]) {
		const movingUp = key === "up" || key === "\x10";
		const harness = createHarness(
			items,
			undefined,
			movingUp ? items[0].id : items[2].id,
		);
		harness.picker.handleInput(key);
		harness.picker.handleInput("enter");
		assert.deepEqual(
			harness.results,
			[{ item: items[movingUp ? 2 : 0], action: "pop" }],
			key,
		);
	}
});

test("stash picker keeps j/k inert before filtering and searchable after slash", () => {
	for (const key of ["j", "k"]) {
		const inert = createHarness();
		inert.picker.handleInput(key);
		inert.picker.handleInput("enter");
		assert.equal(inert.results[0]?.item.id, 3, key);
	}

	const jQuery = createHarness([
		stash(3, "other"),
		stash(2, "jacket"),
		stash(1, "kite"),
	]);
	jQuery.picker.handleInput("/");
	jQuery.picker.handleInput("j");
	jQuery.picker.handleInput("enter");
	assert.equal(jQuery.results[0]?.item.id, 2);

	const kQuery = createHarness([
		stash(3, "other"),
		stash(2, "alpha"),
		stash(1, "kite"),
	]);
	kQuery.picker.handleInput("/");
	kQuery.picker.handleInput("k");
	kQuery.picker.handleInput("enter");
	assert.equal(kQuery.results[0]?.item.id, 1);
});

test("stash picker fixed controls navigate without entering filter bytes", () => {
	const harness = createHarness([
		stash(3, "match third"),
		stash(2, "match second"),
		stash(1, "other"),
	]);
	harness.picker.handleInput("/");
	for (const character of "match") harness.picker.handleInput(character);
	harness.picker.handleInput("\x0e");
	harness.picker.handleInput("\x10");
	harness.picker.handleInput("\x0e");
	harness.picker.handleInput("enter");
	assert.equal(harness.results[0]?.item.id, 2);
});

test("stash picker applies and drops the wrapped row within filtered results", () => {
	const items = [
		stash(5, "excluded newest"),
		stash(4, "excluded next"),
		stash(3, "match third"),
		stash(2, "match second"),
		stash(1, "match first"),
	];
	for (const { key, expected } of [
		{ key: "\x01", expected: { item: items[4], action: "apply" } },
		{
			key: "\x18",
			expected: {
				item: items[4],
				action: "drop",
				selectionAfterDrop: 2,
			},
		},
	]) {
		const harness = createHarness(items);
		harness.picker.handleInput("/");
		for (const character of "match") harness.picker.handleInput(character);
		harness.picker.handleInput("pageUp");
		harness.picker.handleInput(key);
		assert.deepEqual(harness.results, [expected]);
	}
});

test("stash picker safely ignores navigation and selection with no results", () => {
	const noMatches = createHarness();
	noMatches.picker.handleInput("/");
	for (const character of "zzzz") noMatches.picker.handleInput(character);
	for (const harness of [createHarness([]), noMatches]) {
		for (const key of [
			"pageUp",
			"pageDown",
			"up",
			"down",
			"enter",
			"\x01",
			"\x18",
		]) {
			harness.picker.handleInput(key);
		}
		assert.deepEqual(harness.results, []);
		harness.picker.handleInput("escape");
		assert.deepEqual(harness.results, [null]);
	}
});

test("stash picker renders one contextual empty row and responsive hints", () => {
	const harness = createHarness([stash(1, "only stash")]);
	harness.picker.handleInput("/");
	for (const character of "missing") harness.picker.handleInput(character);
	const empty = harness.picker
		.render(50)
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(empty, /No matching stashes\./);
	assert.doesNotMatch(empty, /No matching commands/);

	const narrow = createHarness().picker
		.render(40)
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(narrow, /\/ filter/);
	assert.match(narrow, /\^A/);
	assert.doesNotMatch(narrow, /Ctrl\+X drop · Esc cancel/);
});

test("stash picker emits apply, pop, and drop payloads with row fallback", () => {
	const apply = createHarness();
	apply.picker.handleInput("\x01");
	assert.equal(apply.results[0]?.action, "apply");
	assert.equal(apply.results[0]?.item.id, 3);

	const pop = createHarness();
	pop.picker.handleInput("enter");
	assert.equal(pop.results[0]?.action, "pop");
	assert.equal(pop.results[0]?.item.id, 3);

	const firstDrop = createHarness();
	firstDrop.picker.handleInput("\x18");
	assert.deepEqual(firstDrop.results[0], {
		item: stash(3, "third"),
		action: "drop",
		selectionAfterDrop: 2,
	});

	const middleDrop = createHarness();
	middleDrop.picker.handleInput("down");
	middleDrop.picker.handleInput("\x18");
	assert.equal(middleDrop.results[0]?.item.id, 2);
	assert.equal(middleDrop.results[0]?.selectionAfterDrop, 3);
});

test("slash activates filtering across stash text and cwd", () => {
	const harness = createHarness([
		stash(3, "alpha", "/repo"),
		stash(2, "beta", "/work/other"),
		stash(1, "gamma", "/repo"),
	]);
	harness.picker.focused = true;
	harness.picker.handleInput("/");
	harness.picker.handleInput("o");
	harness.picker.handleInput("t");
	harness.picker.handleInput("h");
	harness.picker.handleInput("e");
	harness.picker.handleInput("r");
	harness.picker.handleInput("enter");
	assert.equal(harness.results[0]?.item.id, 2);
});

test("focus propagates to the search input for terminal cursor placement", () => {
	const harness = createHarness();
	harness.picker.focused = true;
	assert.equal(
		harness.picker.render(50).join("").includes(CURSOR_MARKER),
		false,
	);
	harness.picker.handleInput("/");
	assert.equal(
		harness.picker.render(50).join("").includes(CURSOR_MARKER),
		true,
	);
});

test("stash picker invalidates themed/layout caches and keeps lines in bounds", () => {
	let color = 31;
	const mutableTheme = {
		fg: (_token: string, text: string) => `\u001b[${color}m${text}\u001b[39m`,
		bg: (_token: string, text: string) => text,
		bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
	} as unknown as Theme;
	const picker = createStashPicker(
		{ requestRender() {} } as TUI,
		mutableTheme,
		keybindings(),
		() => {},
		"/repo",
		[stash(1, "a very long multiline\nstash value that must be clipped")],
	);
	const oldLines = picker.render(28);
	assert.ok(oldLines.some((line) => line.includes("\u001b[31m")));
	assertLinesFit(oldLines, 28);

	color = 32;
	assert.deepEqual(picker.render(28), oldLines);
	picker.invalidate();
	const newLines = picker.render(28);
	assert.ok(newLines.some((line) => line.includes("\u001b[32m")));
	assert.notDeepEqual(newLines, oldLines);
	assertLinesFit(newLines, 28);
	assertLinesFit(picker.render(12), 12);
});

test("stash picker uses the shared transparent semantic panel contract", () => {
	const calls: Array<{ kind: "fg" | "bg" | "bold"; token?: string }> = [];
	const pickerTheme = {
		fg: (token: string, text: string) => {
			calls.push({ kind: "fg", token });
			return `\u001b[36m${text}\u001b[39m`;
		},
		bg: (token: string, text: string) => {
			calls.push({ kind: "bg", token });
			return `\u001b[44m${text}\u001b[49m`;
		},
		bold: (text: string) => {
			calls.push({ kind: "bold" });
			return `\u001b[1m${text}\u001b[22m`;
		},
	} as unknown as Theme;
	const picker = createStashPicker(
		{ requestRender() {} } as TUI,
		pickerTheme,
		keybindings(),
		() => {},
		"/repo",
		[stash(2, "latest", "/repo"), stash(1, "older", "/other")],
	);

	for (const width of [0, 1, 2, 9, 36, 90]) {
		const lines = picker.render(width);
		assertLinesFit(lines, width);
		if (width >= 3) {
			for (const line of lines) {
				const plain = stripTerminalSequences(line);
				if (!plain) continue;
				assert.equal(plain[0], " ");
				assert.equal(plain.at(-1), " ");
			}
		}
	}

	const plain = picker
		.render(90)
		.map(stripTerminalSequences)
		.join("\n");
	assert.match(
		plain.split("\n")[0] ?? "",
		/╭.*Prompt stash.*2 saved.*╮/,
	);
	assert.match(plain, /\d{2} \w{3}.*latest/);
	assert.match(plain, /\d{2} \w{3}.*older/);
	assert.match(plain, /├─+┤/);
	assert.match(plain, /Ctrl\+P\/N/);
	assert.doesNotMatch(plain, /j\/k/);
	for (const token of [
		"borderMuted",
		"accent",
		"muted",
		"dim",
		"text",
	]) {
		assert.ok(
			calls.some((call) => call.kind === "fg" && call.token === token),
			token,
		);
	}
	assert.ok(calls.some((call) => call.kind === "bg" && call.token === "selectedBg"));
	assert.ok(calls.some((call) => call.kind === "bold"));
	assert.equal(
		calls.some(
			(call) => call.kind === "bg" && call.token !== "selectedBg",
		),
		false,
	);
});

test("stash rows lead with dates, expand prompts, and show their shared cwd only on the border", () => {
	const firstTimestamp = Date.UTC(2026, 0, 2, 3, 4);
	const secondTimestamp = Date.UTC(2026, 1, 3, 4, 5);
	const sentinel = "POST_FIFTY_TWO_SENTINEL";
	const items = [
		stash(
			2,
			`${"wide stash prompt ".repeat(4)}${sentinel}`,
			"/repo/shared",
		),
		stash(1, "short prompt", "/repo/shared"),
	];
	items[0] = { ...items[0], timestamp: firstTimestamp };
	items[1] = { ...items[1], timestamp: secondTimestamp };
	const picker = createStashPicker(
		{ requestRender() {} } as TUI,
		theme(),
		keybindings(),
		() => {},
		"/repo/shared",
		items,
	);
	const lines = picker.render(160).map(stripTerminalSequences);
	const firstRow = lines.find((line) => line.includes(sentinel)) ?? "";
	const secondRow = lines.find((line) => line.includes("short prompt")) ?? "";
	const firstDate = formattedDate(firstTimestamp);
	const secondDate = formattedDate(secondTimestamp);

	assert.match(lines[0] ?? "", /Prompt stash.*2 saved.*\/repo\/shared/u);
	assert.ok(firstRow, "stash result row should expose text beyond the old cap");
	assert.match(firstRow, new RegExp(`${firstDate}.*${sentinel}`));
	assert.match(secondRow, new RegExp(`${secondDate}.*short prompt`));
	assert.equal(firstRow.indexOf(firstDate), secondRow.indexOf(secondDate));
	assert.doesNotMatch(firstRow, /\/repo\/shared/u);
	assert.doesNotMatch(secondRow, /\/repo\/shared/u);
	assert.equal(lines.join("\n").match(/\/repo\/shared/gu)?.length, 1);
});

test("stash rows keep leading dates across responsive layouts without losing state", () => {
	const items = [
		{ ...stash(3, `match ${"wide ".repeat(20)}third`), timestamp: 3 },
		{ ...stash(2, `match ${"wide ".repeat(20)}second`), timestamp: 2 },
		stash(1, "excluded"),
	];

	for (const widths of [
		[46, 140],
		[140, 46],
	]) {
		const results: Array<PickerResult | null> = [];
		const picker = createStashPicker(
			{ requestRender() {} } as TUI,
			theme(),
			keybindings(),
			(result) => results.push(result),
			"/repo",
			items,
		);
		picker.handleInput("/");
		for (const character of "match") picker.handleInput(character);
		picker.handleInput("down");

		const frames = widths.map((width) =>
			picker.render(width).map(stripTerminalSequences),
		);
		const narrow = frames[widths.indexOf(46)] ?? [];
		const wide = frames[widths.indexOf(140)] ?? [];
		const narrowRow =
			narrow.find((line) => line.includes("wide")) ?? "";
		const wideRow = wide.find((line) => line.includes("wide")) ?? "";

		assert.match(narrowRow, /…/u);
		assert.match(
			narrowRow,
			new RegExp(formattedDate(items[0]?.timestamp ?? 0)),
		);
		assert.match(
			wideRow,
			new RegExp(formattedDate(items[0]?.timestamp ?? 0)),
		);
		assertLinesFit(narrow, 46);
		assertLinesFit(wide, 140);
		picker.handleInput("enter");
		assert.equal(results[0]?.item.id, 2);
	}
});

test("stash border truncates a long scoped cwd without changing row width allocation", () => {
	const items = [
		{ ...stash(2, "prompt with stable allocation"), timestamp: 2 },
		{ ...stash(1, "another prompt"), timestamp: 1 },
	];
	const longCwd = `/repo/${"deeply-nested-directory/".repeat(8)}`;
	const longPicker = createStashPicker(
		{ requestRender() {} } as TUI,
		theme(),
		keybindings(),
		() => {},
		longCwd,
		items,
	);
	const shortPicker = createStashPicker(
		{ requestRender() {} } as TUI,
		theme(),
		keybindings(),
		() => {},
		"/repo",
		items,
	);
	const longLines = longPicker.render(80).map(stripTerminalSequences);
	const shortLines = shortPicker.render(80).map(stripTerminalSequences);
	const top = longLines[0] ?? "";
	const longRow =
		longLines.find((line) => line.includes("stable allocation")) ?? "";
	const shortRow =
		shortLines.find((line) => line.includes("stable allocation")) ?? "";

	assert.match(top, /Prompt stash.*2 saved.*\/repo\/.*…/u);
	assert.equal(longRow, shortRow);
	assert.doesNotMatch(longRow, /\/repo/u);
	assertLinesFit(longLines, 80);

	longPicker.handleInput("/");
	for (const character of "missing") longPicker.handleInput(character);
	const empty = longPicker.render(80).map(stripTerminalSequences);
	assert.match(empty.join("\n"), /No matching stashes\./u);
	assert.match(empty[0] ?? "", /2 saved.*\/repo\/.*…/u);
});

test("stash picker sanitizes persisted text and cwd before styling", () => {
	const picker = createHarness(
		[
			stash(
				1,
				"draft 世界\u001b[2J\u0007\nline",
				"/row/path/that/must/not/render",
			),
		],
		undefined,
		undefined,
		"/repo/\u001b]52;c;SGVsbG8=\u0007unsafe\u009b",
	).picker;
	const lines = picker.render(80);

	assertNoTerminalControls(lines);
	assert.match(lines.join("\n"), /draft 世界 line/);
	assert.match(lines.join("\n"), /unsafe/);
	assert.doesNotMatch(lines.join("\n"), /row\/path/);
});

test("stash picker requests renders after state changes", () => {
	const harness = createHarness();
	const before = harness.getRenders();
	harness.picker.handleInput("down");
	assert.ok(harness.getRenders() > before);
});

function createIndexHarness(
	initial: IndexState = {
		active: false,
		warnings: [],
		productive: false,
	},
): {
	view: HistoryIndexView;
	emit(state: IndexState): void;
	getSubscriberCount(): number;
} {
	let state = initial;
	const listeners = new Set<(next: IndexState) => void>();
	return {
		view: {
			getIndexState: () => state,
			subscribe: (_cwd, listener) => {
				listeners.add(listener);
				listener(state);
				return () => listeners.delete(listener);
			},
		},
		emit(next) {
			state = next;
			for (const listener of listeners) listener(next);
		},
		getSubscriberCount() {
			return listeners.size;
		},
	};
}

function createHistoryHarness(options: {
	items?: PromptItem[];
	state?: IndexState;
	pickerTheme?: Theme;
	bindings?: Record<string, string[]>;
	terminalRows?: number;
	cwd?: string;
}) {
	let items = options.items ?? [];
	const results: Array<PickerResult | null> = [];
	const index = createIndexHarness(options.state);
	let renders = 0;
	const terminalEmptyChanges: boolean[] = [];
	const terminal = { rows: options.terminalRows ?? Number.NaN };
	const picker = createHistoryPicker(
		{
			requestRender() {
				renders += 1;
			},
			terminal,
		} as TUI,
		options.pickerTheme ?? theme(),
		keybindings(options.bindings),
		(result) => results.push(result),
		options.cwd ?? "/repo",
		() => items,
		index.view,
		(terminalEmpty) => terminalEmptyChanges.push(terminalEmpty),
	);
	return {
		picker,
		results,
		index,
		setItems(next: PromptItem[]) {
			items = next;
		},
		setTerminalRows(rows: number) {
			terminal.rows = rows;
		},
		getRenders: () => renders,
		getTerminalEmpty: () =>
			terminalEmptyChanges.filter((terminalEmpty) => terminalEmpty).length,
		getTerminalEmptyChanges: () => [...terminalEmptyChanges],
	};
}

test("stash and history adapters construct the same concrete picker engine", () => {
	const stashPicker = createHarness().picker;
	const index = createIndexHarness();
	const historyPicker = createHistoryPicker(
		{ requestRender() {} } as TUI,
		theme(),
		keybindings(),
		() => {},
		"/repo",
		() => [history("one", "one", 1)],
		index.view,
	);

	assert.ok(stashPicker instanceof PromptPicker);
	assert.ok(historyPicker instanceof PromptPicker);
	assert.equal(stashPicker.constructor, historyPicker.constructor);
	historyPicker.dispose();
	assert.equal(index.getSubscriberCount(), 0);
});

test("shared picker reapplies width-aware layouts without losing filtered selection", () => {
	const items = [
		stash(3, "match third"),
		stash(2, "match second"),
		stash(1, "excluded"),
	];
	const results: Array<PickerResult | null> = [];
	const layouts: Array<{ width: number; values: string[] }> = [];
	const terminal = { rows: 18 };
	const picker = new PromptPicker(
		{
			requestRender() {},
			terminal,
		} as unknown as TUI,
		theme(),
		keybindings(),
		(result) => results.push(result),
		items,
		{
			title: "Test picker",
			inputPrompt: "Filter: ",
			inputPlaceholder: "prompt",
			filterInitiallyActive: true,
			search: (source, query) =>
				source.filter((item) => item.text.includes(query)),
			identity: (item) => String(item.id),
			renderItem: (item) => ({
				label: item.text,
				description: `item ${item.id}`,
			}),
			layoutFactory: (width, renderedItems) => {
				layouts.push({
					width,
					values: renderedItems.map((item) => item.value),
				});
				return {
					minPrimaryColumnWidth: Math.max(1, width - 16),
					maxPrimaryColumnWidth: Math.max(1, width - 16),
				};
			},
			descriptionStyle: (text) => text,
			emptyText: () => "empty",
			footerHints: [[["Esc", "cancel"]]],
			confirmAction: "apply",
			result: (item) => ({ item, action: "apply" }),
		},
	);

	picker.render(60);
	assert.deepEqual(layouts.at(-1), {
		width: 54,
		values: ["3", "2", "1"],
	});

	for (const character of "match") picker.handleInput(character);
	picker.handleInput("down");
	picker.render(44);
	assert.deepEqual(layouts.at(-1), {
		width: 38,
		values: ["3", "2"],
	});

	terminal.rows = 16;
	picker.render(44);
	assert.deepEqual(layouts.at(-1), {
		width: 38,
		values: ["3", "2"],
	});

	picker.replaceItems([
		stash(4, "match newest"),
		...items,
	]);
	assert.deepEqual(layouts.at(-1), {
		width: 38,
		values: ["4", "3", "2"],
	});

	picker.invalidate();
	assert.deepEqual(layouts.at(-1), {
		width: 38,
		values: ["4", "3", "2"],
	});

	picker.render(72);
	assert.deepEqual(layouts.at(-1), {
		width: 66,
		values: ["4", "3", "2"],
	});
	picker.handleInput("enter");
	assert.equal(results[0]?.item.id, 2);
});

test("history picker renders above the editor with the shared zero-line host", async () => {
	const widgetUpdates: Array<{
		key: string;
		value: unknown;
		options?: unknown;
	}> = [];
	let pickerWidget: Component | undefined;
	let inputController: (Component & { focused: boolean }) | undefined;
	let overlay = false;
	let overlayOptions: unknown;
	const tui = {
		requestRender() {},
		terminal: { rows: 24 },
	} as unknown as TUI;
	const index = createIndexHarness();
	const ctx = {
		cwd: "/repo",
		ui: {
			setWidget(key: string, value: unknown, options?: unknown) {
				widgetUpdates.push({ key, value, options });
				if (typeof value === "function") {
					pickerWidget = (
						value as (tui: TUI, theme: Theme) => Component
					)(tui, theme());
				} else {
					pickerWidget = undefined;
				}
			},
			custom(
				factory: (
					tui: TUI,
					theme: Theme,
					keys: KeybindingsManager,
					done: (result: PickerResult | null) => void,
				) => Component & { focused: boolean },
				options: { overlay?: boolean; overlayOptions?: unknown },
			) {
				overlay = options.overlay ?? false;
				overlayOptions = options.overlayOptions;
				return new Promise<PickerResult | null>((resolve) => {
					inputController = factory(tui, theme(), keybindings(), resolve);
					inputController.focused = true;
				});
			},
		},
	} as unknown as ExtensionContext;

	const controller = new AbortController();
	const result = openHistoryPicker(
		ctx,
		() => [history("one", "one", 1)],
		index.view,
		undefined,
		controller.signal,
	);
	assert.equal(overlay, true);
	assert.deepEqual(overlayOptions, {
		anchor: "top-left",
		width: 1,
	});
	assert.equal(widgetUpdates[0]?.key, PI_HISTORY_WIDGET_KEY);
	assert.deepEqual(widgetUpdates[0]?.options, { placement: "aboveEditor" });
	assert.ok(pickerWidget);
	assert.match(pickerWidget.render(60).join("\n"), /Prompt History/);
	assert.ok(inputController);
	assert.deepEqual(inputController.render(60), []);

	controller.abort();
	controller.abort();
	inputController.handleInput?.("enter");
	assert.equal(await result, null);
	assert.equal(widgetUpdates.at(-1)?.key, PI_HISTORY_WIDGET_KEY);
	assert.equal(widgetUpdates.at(-1)?.value, undefined);
	assert.equal(
		widgetUpdates.filter((update) => update.value === undefined).length,
		1,
	);
	assert.equal(index.getSubscriberCount(), 0);
});

test("shared picker host completes success and cancel paths once for both modes", async () => {
	for (const { mode, input, action } of [
		{ mode: "stash", input: "enter", action: "pop" },
		{ mode: "stash", input: "escape", action: null },
		{ mode: "history", input: "enter", action: "apply" },
		{ mode: "history", input: "escape", action: null },
	] as const) {
		let inputController:
			| (Component & { focused: boolean; handleInput(data: string): void })
			| undefined;
		let mounted: (Component & { dispose?(): void }) | undefined;
		let clears = 0;
		const tui = {
			requestRender() {},
			terminal: { rows: 24 },
		} as unknown as TUI;
		const ctx = {
			cwd: "/repo",
			ui: {
				setWidget(_key: string, value: unknown) {
					if (value === undefined) {
						clears += 1;
						mounted?.dispose?.();
						mounted = undefined;
						return;
					}
					mounted = (
						value as (tui: TUI, theme: Theme) => Component
					)(tui, theme());
				},
				custom(
					factory: (
						tui: TUI,
						theme: Theme,
						keys: KeybindingsManager,
						done: (result: PickerResult | null) => void,
					) => Component & {
						focused: boolean;
						handleInput(data: string): void;
					},
				) {
					return new Promise<PickerResult | null>((resolve) => {
						inputController = factory(
							tui,
							theme(),
							keybindings(),
							resolve,
						);
						inputController.focused = true;
					});
				},
			},
		} as unknown as ExtensionContext;
		const index = createIndexHarness();
		const result =
			mode === "stash"
				? openStashPicker(ctx, [stash(1, "one")])
				: openHistoryPicker(
						ctx,
						() => [history("one", "one", 1)],
						index.view,
					);

		assert.ok(inputController, mode);
		inputController.handleInput(input);
		const selected = await result;
		assert.equal(selected?.action ?? null, action, mode);
		assert.equal(clears, 1, mode);
		assert.equal(index.getSubscriberCount(), 0, mode);
	}
});

test("shared picker host cleans up and propagates custom UI rejection", async () => {
	let mounted: Component | undefined;
	let clears = 0;
	const index = createIndexHarness();
	const tui = {
		requestRender() {},
		terminal: { rows: 24 },
	} as unknown as TUI;
	const ctx = {
		cwd: "/repo",
		ui: {
			setWidget(_key: string, value: unknown) {
				if (value === undefined) {
					clears += 1;
					mounted = undefined;
					return;
				}
				mounted = (
					value as (tui: TUI, theme: Theme) => Component
				)(tui, theme());
			},
			custom(
				factory: (
					tui: TUI,
					theme: Theme,
					keys: KeybindingsManager,
					done: (result: PickerResult | null) => void,
				) => Component,
			) {
				factory(tui, theme(), keybindings(), () => {});
				return Promise.reject(new Error("custom failed"));
			},
		},
	} as unknown as ExtensionContext;

	await assert.rejects(
		openHistoryPicker(
			ctx,
			() => [history("one", "one", 1)],
			index.view,
		),
		/custom failed/u,
	);
	assert.equal(mounted, undefined);
	assert.equal(clears, 1);
	assert.equal(index.getSubscriberCount(), 0);
});

test("history picker starts in filter mode and supports all navigation keys", () => {
	const bindings = {
		"tui.select.up": ["custom-up"],
		"tui.select.down": ["custom-down"],
		"tui.select.pageUp": ["custom-page-up"],
		"tui.select.pageDown": ["custom-page-down"],
		"tui.select.confirm": ["custom-enter"],
		"tui.select.cancel": ["custom-cancel"],
	};
	const items = Array.from({ length: 15 }, (_, index) =>
		history(String(index), `prompt ${index}`, 100 - index),
	);

	const down = createHistoryHarness({ items, bindings });
	down.picker.focused = true;
	assert.equal(down.picker.render(80).join("").includes(CURSOR_MARKER), true);
	down.picker.handleInput("custom-down");
	down.picker.handleInput("custom-enter");
	assert.equal(down.results[0]?.item.id, "1");

	const control = createHistoryHarness({ items, bindings });
	control.picker.handleInput("\x0e");
	control.picker.handleInput("\x10");
	control.picker.handleInput("custom-enter");
	assert.equal(control.results[0]?.item.id, "0");

	const page = createHistoryHarness({ items, bindings });
	page.picker.handleInput("custom-page-down");
	page.picker.handleInput("custom-enter");
	assert.equal(page.results[0]?.item.id, "10");

	const cancelled = createHistoryHarness({ items, bindings });
	cancelled.picker.handleInput("custom-cancel");
	assert.equal(cancelled.results[0], null);
});

test("history picker wraps row and page navigation in both directions", () => {
	const three = [
		history("0", "prompt 0", 3),
		history("1", "prompt 1", 2),
		history("2", "prompt 2", 1),
	];
	for (const { keys, expected } of [
		{ keys: ["up"], expected: "2" },
		{ keys: ["\x10"], expected: "2" },
		{ keys: ["up", "down"], expected: "0" },
		{ keys: ["pageUp"], expected: "2" },
	]) {
		const harness = createHistoryHarness({ items: three });
		for (const key of keys) harness.picker.handleInput(key);
		harness.picker.handleInput("enter");
		assert.equal(harness.results[0]?.item.id, expected, keys.join(", "));
	}

	const fifteen = Array.from({ length: 15 }, (_, index) =>
		history(String(index), `prompt ${index}`, 15 - index),
	);
	const page = createHistoryHarness({ items: fifteen });
	page.picker.handleInput("pageDown");
	page.picker.handleInput("pageDown");
	page.picker.handleInput("enter");
	assert.equal(page.results[0]?.item.id, "5");

	const single = createHistoryHarness({
		items: [history("only", "only prompt", 1)],
	});
	single.picker.handleInput("pageUp");
	single.picker.handleInput("pageDown");
	single.picker.handleInput("enter");
	assert.equal(single.results[0]?.item.id, "only");
});

test("history picker budgets rows from terminal height and pages by the visible count", () => {
	const items = Array.from({ length: 12 }, (_, index) =>
		history(String(index), `prompt ${index}`, 12 - index),
	);
	const normal = createHistoryHarness({
		items,
		terminalRows: 16,
	});
	const normalLines = normal.picker.render(90).map(stripTerminalSequences);
	assert.equal(normalLines.filter((line) => /prompt \d+/u.test(line)).length, 4);
	normal.picker.handleInput("pageDown");
	normal.picker.handleInput("enter");
	assert.equal(normal.results[0]?.item.id, "4");

	const indexing = createHistoryHarness({
		items,
		terminalRows: 16,
		state: {
			active: true,
			progress: { phase: "prompts", loaded: 2, total: 12 },
			warnings: [],
			productive: true,
		},
	});
	const indexingLines = indexing.picker
		.render(90)
		.map(stripTerminalSequences);
	assert.equal(
		indexingLines.filter((line) => /prompt \d+/u.test(line)).length,
		3,
	);
	assert.match(indexingLines.join("\n"), /Indexing prompts 2\/12…/u);
	indexing.picker.handleInput("pageDown");
	indexing.picker.handleInput("enter");
	assert.equal(indexing.results[0]?.item.id, "3");

	const short = createHistoryHarness({
		items,
		terminalRows: 12,
		state: {
			active: true,
			progress: { phase: "sessions", loaded: 1, total: 4 },
			warnings: [],
			productive: false,
		},
	});
	const shortLines = short.picker.render(70).map(stripTerminalSequences);
	assert.equal(shortLines.filter((line) => /prompt \d+/u.test(line)).length, 1);
	assertLinesFit(short.picker.render(70), 70);
});

test("history picker recomputes page size before rendering after a resize", () => {
	const items = Array.from({ length: 20 }, (_, index) =>
		history(String(index), `row-content-${index}`, 20 - index),
	);
	const resized = createHistoryHarness({ items, terminalRows: 16 });
	assert.equal(
		resized.picker
			.render(80)
			.filter((line) => /row-content-/u.test(line)).length,
		4,
	);
	resized.setTerminalRows(14);
	resized.picker.handleInput("pageDown");
	assert.equal(
		resized.picker
			.render(80)
			.filter((line) => /row-content-/u.test(line)).length,
		2,
	);
	resized.picker.handleInput("enter");
	assert.equal(resized.results[0]?.item.id, "2");
});

test("history picker filters and renders ranking metadata, images, and exact highlights", () => {
	const taggedTheme = {
		fg: (color: string, text: string) =>
			color === "searchMatchText" ? `⟦${text}⟧` : text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const harness = createHistoryHarness({
		pickerTheme: taggedTheme,
		items: [
			history("fuzzy", "Configure user session output retries", 30),
			history("substring", "Fix the cursor in the editor", 20, {
				sessionName: "Editor work",
				cwd: "/repo/subdir",
				hasImages: true,
			}),
			history("exact", "cursor", 10, { sessionName: "Exact" }),
		],
	});
	for (const character of "cursor") harness.picker.handleInput(character);
	const rendered = harness.picker.render(120).join("\n");
	assert.match(rendered, /Exact/);
	assert.match(rendered, /Editor work/);
	assert.match(rendered, /🖼/);
	assert.match(rendered, /\/repo/);
	assert.doesNotMatch(rendered, /subdir/);
	assert.match(rendered, /⟦cursor⟧/i);
	assert.ok(
		rendered.indexOf("Exact") < rendered.indexOf("Editor work"),
		"exact match should render before substring match",
	);
});

test("history rows use the full prompt and move their invariant cwd to the border", () => {
	const sentinel = "POST_SEVENTY_SENTINEL";
	const prompt = `${"long history prompt ".repeat(5)}${sentinel}`;
	const timestamp = Date.UTC(2026, 0, 2, 3, 4);
	const harness = createHistoryHarness({
		cwd: "/repo/shared",
		items: [history("unnamed", prompt, timestamp)],
	});
	const lines = harness.picker.render(180).map(stripTerminalSequences);
	const top = lines[0] ?? "";
	const row = lines.find((line) => line.includes(sentinel)) ?? "";

	assert.match(top, /Prompt History/);
	assert.match(top, /\/repo\/shared/);
	assert.ok(row, "history result row should expose text beyond the old cap");
	assert.doesNotMatch(row, /History/);
	assert.doesNotMatch(row, /\/repo\/shared/);
	assert.match(
		row,
		new RegExp(`${formattedDate(timestamp)}.*${sentinel}`),
	);
	assert.equal(
		lines.join("\n").match(/\/repo\/shared/gu)?.length,
		1,
	);
});

test("history rows keep sanitized searchable session names and exact highlights", () => {
	const taggedTheme = {
		fg: (color: string, text: string) =>
			color === "searchMatchText" ? `⟦${text}⟧` : text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const harness = createHistoryHarness({
		pickerTheme: taggedTheme,
		items: [
			history("named", "review the release plan", 1, {
				sessionName: "Team\u001b[2J\nSession",
			}),
		],
	});
	for (const character of "session") harness.picker.handleInput(character);
	const lines = harness.picker.render(100);
	const plain = lines.map(stripTerminalSequences);
	const row = plain.find((line) => line.includes("release plan")) ?? "";

	assertNoTerminalControls(lines);
	assert.match(
		row,
		new RegExp(`${formattedDate(1)}.*Team ⟦Session⟧`),
	);
	assert.doesNotMatch(row, /History/);
});

test("history row truncation follows the rendered boundary and preserves state on resize", () => {
	const items = [
		history("first", `match ${"boundary ".repeat(20)}first`, 2),
		history("second", `match ${"boundary ".repeat(20)}second`, 1),
	];
	const harness = createHistoryHarness({ items });
	for (const character of "match") harness.picker.handleInput(character);
	harness.picker.handleInput("down");

	const narrow = harness.picker.render(42).map(stripTerminalSequences);
	const resultRow = narrow.find((line) => line.includes("boundary")) ?? "";
	assert.ok(resultRow);
	assert.match(resultRow, /…/u);
	assert.doesNotMatch(resultRow, /→\s*·/u);
	assertLinesFit(narrow, 42);

	const wide = harness.picker.render(180).map(stripTerminalSequences);
	assert.match(wide.join("\n"), /boundary boundary boundary/u);
	assertLinesFit(wide, 180);
	harness.picker.handleInput("enter");
	assert.equal(harness.results[0]?.item.id, "second");
});

test("history border path survives empty filtering without entering result rows", () => {
	const harness = createHistoryHarness({
		cwd: "/repo/shared",
		items: [history("one", "one prompt", 1)],
	});
	for (const character of "missing") harness.picker.handleInput(character);
	const lines = harness.picker.render(90).map(stripTerminalSequences);
	const rendered = lines.join("\n");

	assert.match(rendered, /No matching prompts\./);
	assert.equal(rendered.match(/\/repo\/shared/gu)?.length, 1);
	assert.match(lines[0] ?? "", /\/repo\/shared/);
});

test("history picker displays both progress phases and re-queries live results", () => {
	const harness = createHistoryHarness({
		items: [],
		state: {
			active: true,
			progress: { phase: "sessions", loaded: 2, total: 5 },
			warnings: [],
			productive: false,
		},
	});
	assert.match(harness.picker.render(70).join("\n"), /Indexing sessions 2\/5…/);
	assert.equal(harness.picker.isTerminallyEmpty(), false);
	assert.match(
		harness.picker.render(70).join("\n"),
		/Waiting for indexed prompts/,
	);

	const before = harness.getRenders();
	harness.setItems([history("new", "newly indexed prompt", 10)]);
	harness.index.emit({
		active: true,
		progress: { phase: "prompts", loaded: 1, total: 3 },
		warnings: [],
		productive: true,
	});
	const rendered = harness.picker.render(70).join("\n");
	assert.match(rendered, /Indexing prompts 1\/3…/);
	assert.match(rendered, /newly indexed prompt/);
	assert.ok(harness.getRenders() > before);
});

test("history picker preserves the selected prompt on progress-only updates", () => {
	const items = [
		history("3", "third", 3),
		history("2", "second", 2),
		history("1", "first", 1),
	];
	const harness = createHistoryHarness({
		items,
		state: {
			active: true,
			progress: { phase: "prompts", loaded: 0, total: 10 },
			warnings: [],
			productive: true,
		},
	});
	harness.picker.handleInput("down");
	harness.index.emit({
		active: true,
		progress: { phase: "prompts", loaded: 1, total: 10 },
		warnings: [],
		productive: true,
	});
	assert.match(harness.picker.render(80).join("\n"), /Indexing prompts 1\/10…/);
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, [{ item: items[1], action: "apply" }]);
});

test("history picker preserves session-and-entry identity when live results reorder", () => {
	const newest = history("3", "prompt third", 3, {
		sessionPath: "/sessions/selected.jsonl",
	});
	const selected = history("2", "prompt second", 2, {
		sessionPath: "/sessions/selected.jsonl",
	});
	const oldest = history("1", "prompt first", 1);
	const harness = createHistoryHarness({ items: [newest, selected, oldest] });
	for (const character of "prompt") harness.picker.handleInput(character);
	harness.picker.handleInput("down");

	const refreshed = { ...selected, text: "prompt second refreshed" };
	harness.setItems([
		history("2", "prompt second from fork", 4, {
			sessionPath: "/sessions/fork.jsonl",
		}),
		{ ...oldest, timestamp: 5 },
		refreshed,
		{ ...newest },
	]);
	harness.index.emit({ active: false, warnings: [], productive: true });
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, [{ item: refreshed, action: "apply" }]);
});

test("history picker preserves selection when moving the search cursor", () => {
	const items = [
		history("3", "prompt third", 3),
		history("2", "prompt second", 2),
		history("1", "prompt first", 1),
	];
	const harness = createHistoryHarness({ items });
	for (const character of "prompt") harness.picker.handleInput(character);
	harness.picker.handleInput("down");
	harness.picker.handleInput("\x1b[D");
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, [{ item: items[1], action: "apply" }]);
});

test("history picker resets to the first result when the search query changes", () => {
	const items = [
		history("3", "prompt third", 3),
		history("2", "prompt second", 2),
		history("1", "prompt first", 1),
	];
	for (const edit of ["r", "\x7f"]) {
		const harness = createHistoryHarness({ items });
		harness.picker.handleInput("p");
		harness.picker.handleInput("down");
		harness.picker.handleInput(edit);
		harness.picker.handleInput("enter");
		assert.deepEqual(harness.results, [{ item: items[0], action: "apply" }]);
	}
});

test("history picker falls back to the first result when the selected prompt stops matching", () => {
	const items = [
		history("3", "prompt third", 3),
		history("2", "prompt second", 2),
		history("1", "prompt first", 1),
	];
	const harness = createHistoryHarness({ items });
	for (const character of "prompt") harness.picker.handleInput(character);
	harness.picker.handleInput("down");
	harness.setItems([
		items[0],
		{ ...items[1], text: "unrelated" },
		items[2],
	]);
	harness.index.emit({ active: false, warnings: [], productive: true });
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, [{ item: items[0], action: "apply" }]);
});

test("history picker falls back to the first result when selection leaves the result cap", () => {
	const items = Array.from({ length: HISTORY_RESULT_LIMIT }, (_, index) =>
		history(String(index), `prompt ${index}`, HISTORY_RESULT_LIMIT - index),
	);
	const harness = createHistoryHarness({ items });
	for (let index = 1; index < items.length; index += 1) {
		harness.picker.handleInput("down");
	}
	const newest = history("new", "newly indexed", HISTORY_RESULT_LIMIT + 1);
	harness.setItems([newest, ...items]);
	harness.index.emit({ active: false, warnings: [], productive: true });
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, [{ item: newest, action: "apply" }]);
});

test("history picker safely handles selection removal through empty results and recovery", () => {
	const harness = createHistoryHarness({
		items: [history("3", "third", 3), history("2", "second", 2)],
	});
	harness.picker.handleInput("down");
	harness.setItems([]);
	harness.index.emit({ active: true, warnings: [], productive: false });
	harness.picker.handleInput("down");
	harness.picker.handleInput("up");
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, []);
	assert.match(harness.picker.render(80).join("\n"), /Waiting for indexed prompts/);

	const newest = history("new", "newly indexed", 4);
	harness.setItems([newest]);
	harness.index.emit({ active: false, warnings: [], productive: true });
	harness.picker.handleInput("enter");
	assert.deepEqual(harness.results, [{ item: newest, action: "apply" }]);
});

test("history picker exposes final no-history state only after indexing ends", () => {
	const harness = createHistoryHarness({
		items: [],
		state: {
			active: true,
			progress: { phase: "prompts", loaded: 0, total: 1 },
			warnings: [],
			productive: false,
		},
	});
	assert.equal(harness.picker.isTerminallyEmpty(), false);
	assert.equal(harness.getTerminalEmpty(), 0);

	harness.index.emit({
		active: false,
		warnings: [],
		productive: false,
	});
	assert.equal(harness.picker.isTerminallyEmpty(), true);
	assert.equal(harness.getTerminalEmpty(), 1);
	const rendered = harness.picker.render(60).join("\n");
	assert.match(rendered, /No prompt history found/);
	assert.doesNotMatch(rendered, /No matching commands/);
});

test("history terminal-empty notification resets after results recover", () => {
	const harness = createHistoryHarness({ items: [] });
	assert.equal(harness.getTerminalEmpty(), 1);

	harness.setItems([history("new", "new result", 2)]);
	harness.index.emit({
		active: false,
		warnings: [],
		productive: true,
	});
	assert.equal(harness.getTerminalEmpty(), 1);
	assert.deepEqual(harness.getTerminalEmptyChanges(), [true, false]);

	harness.setItems([]);
	harness.index.emit({
		active: false,
		warnings: [],
		productive: false,
	});
	assert.equal(harness.getTerminalEmpty(), 2);
	assert.deepEqual(harness.getTerminalEmptyChanges(), [true, false, true]);
});

test("history picker disposal is idempotent and stops live updates", () => {
	const harness = createHistoryHarness({
		items: [history("one", "one prompt", 1)],
	});
	assert.equal(harness.getTerminalEmpty(), 0);
	assert.equal(harness.index.getSubscriberCount(), 1);

	const rendersBeforeDispose = harness.getRenders();
	harness.picker.dispose();
	harness.picker.dispose();
	assert.equal(harness.index.getSubscriberCount(), 0);
	harness.setItems([history("late", "late prompt", 2)]);
	harness.index.emit({ active: false, warnings: [], productive: true });
	assert.equal(harness.getRenders(), rendersBeforeDispose);
	assert.equal(harness.getTerminalEmpty(), 0);
});

test("history cancel and confirm release the live index subscription", () => {
	for (const key of ["escape", "enter"]) {
		const harness = createHistoryHarness({
			items: [history("one", "one", 1)],
		});
		assert.equal(harness.index.getSubscriberCount(), 1);
		harness.picker.handleInput(key);
		assert.equal(harness.index.getSubscriberCount(), 0, key);
	}
});

test("history picker caps rows and every rendered line to the supplied width", () => {
	const harness = createHistoryHarness({
		items: Array.from({ length: 30 }, (_, index) =>
			history(
				String(index),
				`very long history prompt ${index} with enough text to overflow a narrow terminal`,
				index,
			),
		),
	});
	const lines = harness.picker.render(32);
	assertLinesFit(lines, 32);
	const promptRows = lines.filter((line) => /history prompt/.test(line));
	assert.ok(promptRows.length <= 10);
});

test("history picker sanitizes prompt, session, and cwd metadata before styling", () => {
	const harness = createHistoryHarness({
		cwd: "/repo/\u001b]52;c;SGVsbG8=\u0007unsafe\u009b31mred\u009c",
		items: [
			history("unsafe", "prompt\u001b[2J\u0007\ntext", 1, {
				sessionName: "session\u001b]52;c;SGVsbG8=\u0007 name",
				cwd: "/row/path/that/must/not/render",
			}),
		],
	});
	const lines = harness.picker.render(100);

	assertNoTerminalControls(lines);
	assert.match(lines.join("\n"), /prompt text/);
	assert.match(lines.join("\n"), /session name/);
	assert.match(lines.join("\n"), /31mred/);
	assert.doesNotMatch(lines.join("\n"), /row\/path/);
});

test("history picker uses the shared live-theme transparent panel contract", () => {
	let color = 35;
	const calls: Array<{ kind: "fg" | "bg" | "bold"; token?: string }> = [];
	const pickerTheme = {
		fg: (token: string, text: string) => {
			calls.push({ kind: "fg", token });
			return `\u001b[${color}m${text}\u001b[39m`;
		},
		bg: (token: string, text: string) => {
			calls.push({ kind: "bg", token });
			return `\u001b[44m${text}\u001b[49m`;
		},
		bold: (text: string) => {
			calls.push({ kind: "bold" });
			return `\u001b[1m${text}\u001b[22m`;
		},
	} as unknown as Theme;
	const harness = createHistoryHarness({
		pickerTheme,
		items: [
			history("one", "Unicode 世界 prompt", 1, {
				sessionName: "Session",
				cwd: "/repo/subdir",
				hasImages: true,
			}),
		],
	});

	for (const width of [0, 1, 2, 9, 38, 100]) {
		const lines = harness.picker.render(width);
		assertLinesFit(lines, width);
		if (width >= 3) {
			for (const line of lines) {
				const plainLine = stripTerminalSequences(line);
				if (!plainLine) continue;
				assert.equal(plainLine[0], " ");
				assert.equal(plainLine.at(-1), " ");
			}
		}
	}

	const oldLines = harness.picker.render(100);
	const plain = oldLines.map(stripTerminalSequences).join("\n");
	assert.match(plain.split("\n")[0] ?? "", /╭.*Prompt History.*╮/);
	assert.match(plain, /Session/);
	assert.match(plain, /\/repo/);
	assert.doesNotMatch(plain, /subdir/);
	assert.match(plain, /Ctrl\+P\/N/);
	assert.match(plain, /Arrows/);
	assert.match(plain, /Page/);
	assert.doesNotMatch(plain, /j\/k/);
	for (const token of [
		"borderMuted",
		"accent",
		"muted",
		"dim",
		"text",
	]) {
		assert.ok(
			calls.some((call) => call.kind === "fg" && call.token === token),
			token,
		);
	}
	assert.ok(calls.some((call) => call.kind === "bg" && call.token === "selectedBg"));
	assert.ok(calls.some((call) => call.kind === "bold"));

	color = 32;
	assert.deepEqual(harness.picker.render(100), oldLines);
	harness.picker.invalidate();
	const newLines = harness.picker.render(100);
	assert.notDeepEqual(newLines, oldLines);
	assert.ok(newLines.some((line) => line.includes("\u001b[32m")));
	assert.equal(newLines.some((line) => line.includes("\u001b[35m")), false);
});

// Compile-time guard: the concrete picker remains focusable and directly testable.
const _pickerType: StashPicker | undefined = undefined;
const _historyPickerType: HistoryPicker | undefined = undefined;
void _pickerType;
void _historyPickerType;
