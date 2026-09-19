import { relative } from "node:path";
import type {
	ExtensionContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type TUI,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import {
	DEFAULT_STASH_ENTER_ACTION,
	HISTORY_RESULT_LIMIT,
	PICKER_VISIBLE_ROWS,
	type PickerResult,
	type PromptAction,
	type PromptItem,
	promptMatchIndexes,
	sanitizePlainTerminalText,
	searchPrompts,
} from "./model.ts";
import type { IndexState } from "./store.ts";
import {
	applyPanelMargin,
	chooseWidthCandidate,
	formatKeyHint,
	formatMetadata,
	formatSavedCount,
	formatSeparator,
	renderPanelBottom,
	renderPanelDivider,
	renderPanelRow,
	renderPanelTop,
	selectedRowText,
} from "./ui.ts";

export const PI_HISTORY_WIDGET_KEY = "pi-history.stashes";

function displayCwd(cwd: string): string {
	const home = process.env.HOME;
	if (!home) return sanitizePlainTerminalText(cwd);
	const fromHome = relative(home, cwd);
	if (!fromHome || fromHome.startsWith("..")) {
		return sanitizePlainTerminalText(cwd);
	}
	return sanitizePlainTerminalText(`~/${fromHome}`);
}

function dateLabel(timestamp: number): string {
	if (!Number.isFinite(timestamp)) return "";
	return new Date(timestamp).toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function joinedHints(
	theme: Theme,
	hints: ReadonlyArray<readonly [key: string, action: string]>,
): string {
	return hints
		.map(([key, action]) => formatKeyHint(theme, key, action))
		.join(` ${formatSeparator(theme)} `);
}

function responsiveHints(
	theme: Theme,
	width: number,
	candidates: ReadonlyArray<
		ReadonlyArray<readonly [key: string, action: string]>
	>,
): string {
	return chooseWidthCandidate(
		candidates.map((hints) => joinedHints(theme, hints)),
		width,
	);
}

function styledMetadata(theme: Theme, text: string): string {
	const leading = text.match(/^ */u)?.[0] ?? "";
	return `${leading}${text
		.slice(leading.length)
		.split(" · ")
		.map((part) => formatMetadata(theme, part))
		.join(` ${formatSeparator(theme)} `)}`;
}

type PickerTui = Pick<TUI, "requestRender"> & {
	terminal?: { rows: number };
};

interface PickerRenderContext {
	sourceCount: number;
	query: string;
	filterActive: boolean;
}

interface PickerSelectionContext {
	filtered: readonly PromptItem[];
	selectedIndex: number;
}

interface PickerConfig {
	title: string;
	info?: () => string;
	inputPrompt: string;
	inputPlaceholder: string;
	filterInitiallyActive: boolean;
	search: (
		items: readonly PromptItem[],
		query: string,
	) => readonly PromptItem[];
	identity: (item: PromptItem) => string;
	renderItem: (
		item: PromptItem,
		query: string,
		theme: Theme,
	) => Pick<SelectItem, "label" | "description">;
	layoutFactory?: (
		width: number,
		items: readonly SelectItem[],
	) => SelectListLayoutOptions;
	descriptionStyle: (text: string, theme: Theme) => string;
	emptyText: (context: PickerRenderContext) => string;
	statusText?: () => string | undefined;
	inactiveHints?: ReadonlyArray<
		ReadonlyArray<readonly [key: string, action: string]>
	>;
	footerHints: ReadonlyArray<
		ReadonlyArray<readonly [key: string, action: string]>
	>;
	divider?: boolean;
	confirmAction: PromptAction;
	resolveAction?: (data: string) => PromptAction | undefined;
	result: (
		item: PromptItem,
		action: PromptAction,
		context: PickerSelectionContext,
	) => PickerResult;
	initialSelectedIdentity?: string;
	dispose?: () => void;
	isTerminallyEmpty?: () => boolean;
}

// Pi keeps a two-row content floor above five rows of editor/status chrome.
const PICKER_TERMINAL_HOST_RESERVE = 7;
const PICKER_SCROLL_ROW_RESERVE = 1;

function truncateAtBoundary(text: string, width: number): string {
	return truncateToWidth(text, width, width > 0 ? "…" : "");
}

function singleColumnListLayout(): SelectListLayoutOptions {
	return {
		truncatePrimary: ({ text, maxWidth }) =>
			truncateAtBoundary(text, maxWidth),
	};
}

/**
 * Concrete picker engine shared by the stash and history construction
 * adapters. Mode-specific code supplies search, rows, actions, and live state;
 * this class owns focus/input, list geometry, selection, panel composition,
 * navigation, invalidation, and disposal.
 */
export class PromptPicker implements Component, Focusable {
	private readonly tui: PickerTui;
	private readonly theme: Theme;
	private readonly keybindings: KeybindingsManager;
	private readonly done: (result: PickerResult | null) => void;
	private readonly config: PickerConfig;
	private readonly input: Input;
	private sourceItems: PromptItem[];
	private filtered: PromptItem[];
	private list: SelectList;
	private selectedIndex = 0;
	private visibleRows: number;
	private filterActive: boolean;
	private focusedValue = false;
	private finished = false;
	private disposed = false;
	private listContentWidth: number | undefined;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		tui: PickerTui,
		theme: Theme,
		keybindings: KeybindingsManager,
		done: (result: PickerResult | null) => void,
		items: readonly PromptItem[],
		config: PickerConfig,
	) {
		this.tui = tui;
		this.theme = theme;
		this.keybindings = keybindings;
		this.done = done;
		this.config = config;
		this.sourceItems = [...items];
		this.filterActive = config.filterInitiallyActive;
		this.input = new Input({
			prompt: config.inputPrompt,
			placeholder: config.inputPlaceholder,
			placeholderStyle: (text) => this.theme.fg("dim", text),
		});
		this.filtered = [...config.search(this.sourceItems, "")];
		this.visibleRows = this.calculateVisibleRows();
		if (config.initialSelectedIdentity !== undefined) {
			const selectedIndex = this.filtered.findIndex(
				(item) => config.identity(item) === config.initialSelectedIdentity,
			);
			if (selectedIndex >= 0) this.selectedIndex = selectedIndex;
		}
		this.list = this.createList();
	}

	get focused(): boolean {
		return this.focusedValue;
	}

	set focused(value: boolean) {
		this.focusedValue = value;
		this.input.focused = value && this.filterActive;
		this.invalidate();
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.finish(null);
			return;
		}

		if (!this.filterActive && matchesKey(data, Key.slash)) {
			this.filterActive = true;
			this.input.focused = this.focusedValue;
			this.invalidateAndRender();
			return;
		}

		const action = this.config.resolveAction?.(data);
		if (action !== undefined) {
			this.choose(action);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.choose(this.config.confirmAction);
			return;
		}

		if (matchesKey(data, Key.ctrl("p"))) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.ctrl("n"))) {
			this.move(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.move(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.move(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.syncVisibleRows();
			this.move(-this.visibleRows);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.syncVisibleRows();
			this.move(this.visibleRows);
			return;
		}

		if (!this.filterActive) return;

		const query = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== query) this.applyFilter();
		this.invalidateAndRender();
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		this.syncVisibleRows();
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const panelWidth = Math.max(0, width - 2);
		const contentWidth = Math.max(1, panelWidth - 4);
		this.syncListWidth(contentWidth);
		const lines: string[] = [
			renderPanelTop(
				this.theme,
				panelWidth,
				this.config.title,
				this.config.info?.() ?? "",
			),
		];
		if (this.filterActive) {
			const inputLine = this.input.render(contentWidth)[0] ?? "";
			lines.push(renderPanelRow(this.theme, panelWidth, inputLine));
		} else {
			lines.push(
				renderPanelRow(
					this.theme,
					panelWidth,
					responsiveHints(
						this.theme,
						contentWidth,
						this.config.inactiveHints ?? [],
					),
				),
			);
		}

		const status = this.config.statusText?.();
		if (status) {
			lines.push(
				renderPanelRow(
					this.theme,
					panelWidth,
					formatMetadata(this.theme, status),
				),
			);
		}
		if (this.filtered.length === 0) {
			lines.push(
				renderPanelRow(
					this.theme,
					panelWidth,
					this.theme.fg(
						"warning",
						this.config.emptyText({
							sourceCount: this.sourceItems.length,
							query: this.input.getValue(),
							filterActive: this.filterActive,
						}),
					),
				),
			);
		} else {
			for (const line of this.list.render(contentWidth)) {
				lines.push(renderPanelRow(this.theme, panelWidth, line));
			}
		}
		if (this.config.divider) {
			lines.push(renderPanelDivider(this.theme, panelWidth));
		}
		lines.push(
			renderPanelRow(
				this.theme,
				panelWidth,
				responsiveHints(
					this.theme,
					contentWidth,
					this.config.footerHints,
				),
			),
			renderPanelBottom(this.theme, panelWidth),
		);

		this.cachedWidth = width;
		this.cachedLines = applyPanelMargin(lines, width);
		return this.cachedLines;
	}

	invalidate(): void {
		this.invalidateRendering(true);
	}

	private invalidateRendering(rebuildList: boolean): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.input.invalidate();
		if (rebuildList) this.list = this.createList();
		this.list.invalidate();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.config.dispose?.();
	}

	isTerminallyEmpty(): boolean {
		return this.config.isTerminallyEmpty?.() ?? false;
	}

	replaceItems(items: readonly PromptItem[]): void {
		const selected = this.filtered[this.selectedIndex];
		const selectedIdentity = selected
			? this.config.identity(selected)
			: undefined;
		this.sourceItems = [...items];
		this.applyFilter(selectedIdentity);
		this.syncVisibleRows();
		this.invalidateAndRender();
	}

	private createList(): SelectList {
		const selectItems: SelectItem[] = this.filtered.map((item) => ({
			value: this.config.identity(item),
			...this.config.renderItem(
				item,
				this.input.getValue(),
				this.theme,
			),
		}));
		const layout = this.listContentWidth === undefined
			? undefined
			: this.config.layoutFactory?.(
					this.listContentWidth,
					selectItems,
				);
		const list = new SelectList(
			selectItems,
			this.visibleRows,
			{
				selectedPrefix: (text) => this.theme.fg("accent", text),
				selectedText: (text) =>
					selectedRowText(this.theme, text),
				description: (text) =>
					this.config.descriptionStyle(text, this.theme),
				scrollInfo: (text) => this.theme.fg("dim", text),
				noMatch: (text) => this.theme.fg("warning", text),
			},
			layout,
		);
		list.setSelectedIndex(this.selectedIndex);
		return list;
	}

	private syncListWidth(width: number): void {
		if (width === this.listContentWidth) return;
		this.listContentWidth = width;
		if (!this.config.layoutFactory) return;
		this.list = this.createList();
	}

	private syncVisibleRows(): void {
		const next = this.calculateVisibleRows();
		if (next === this.visibleRows) return;
		this.visibleRows = next;
		this.list = this.createList();
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private calculateVisibleRows(): number {
		const terminalRows = this.tui.terminal?.rows;
		if (typeof terminalRows !== "number" || !Number.isFinite(terminalRows)) {
			return PICKER_VISIBLE_ROWS;
		}
		const fixedPanelRows =
			4 +
			(this.config.divider ? 1 : 0) +
			(this.config.statusText?.() ? 1 : 0);
		return Math.max(
			1,
			Math.min(
				PICKER_VISIBLE_ROWS,
				Math.floor(terminalRows) -
					fixedPanelRows -
					PICKER_SCROLL_ROW_RESERVE -
					PICKER_TERMINAL_HOST_RESERVE,
			),
		);
	}

	private applyFilter(selectedIdentity?: string): void {
		this.filtered = [
			...this.config.search(this.sourceItems, this.input.getValue()),
		];
		const selectedIndex =
			selectedIdentity === undefined
				? -1
				: this.filtered.findIndex(
						(item) => this.config.identity(item) === selectedIdentity,
					);
		this.selectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
		this.list = this.createList();
	}

	private move(delta: number): void {
		if (this.filtered.length === 0) return;
		this.selectedIndex =
			(((this.selectedIndex + delta) % this.filtered.length) +
				this.filtered.length) %
			this.filtered.length;
		this.list.setSelectedIndex(this.selectedIndex);
		this.invalidateAndRender();
	}

	private choose(action: PromptAction): void {
		const item = this.filtered[this.selectedIndex];
		if (!item) return;
		this.finish(
			this.config.result(item, action, {
				filtered: this.filtered,
				selectedIndex: this.selectedIndex,
			}),
		);
	}

	private finish(result: PickerResult | null): void {
		if (this.finished) return;
		this.finished = true;
		this.dispose();
		this.done(result);
	}

	private invalidateAndRender(): void {
		this.invalidateRendering(false);
		this.tui.requestRender();
	}
}

export { PromptPicker as HistoryPicker, PromptPicker as StashPicker };

function stashIdentityValue(id: PromptItem["id"]): string {
	return `stash:${typeof id}:${String(id)}`;
}

function stashIdentity(item: PromptItem): string {
	return stashIdentityValue(item.id);
}

export function createStashPicker(
	tui: TUI,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: PickerResult | null) => void,
	cwd: string,
	items: readonly PromptItem[],
	selected?: PromptItem["id"],
): PromptPicker {
	return new PromptPicker(tui, theme, keybindings, done, items, {
		title: "Prompt stash",
		info: () => `${formatSavedCount(items.length)} · ${displayCwd(cwd)}`,
		inputPrompt: "Filter: ",
		inputPlaceholder: "stash text or directory",
		filterInitiallyActive: false,
		search: (source, query) =>
			searchPrompts(source, query, source.length, { includeCwd: true }),
		identity: stashIdentity,
		renderItem: (item, _query, pickerTheme) => ({
			label: [
				styledMetadata(pickerTheme, dateLabel(item.timestamp)),
				sanitizePlainTerminalText(item.text),
			]
				.filter(Boolean)
				.join(` ${formatSeparator(pickerTheme)} `),
		}),
		layoutFactory: singleColumnListLayout,
		descriptionStyle: (text, pickerTheme) =>
			styledMetadata(pickerTheme, text),
		emptyText: ({ sourceCount }) =>
			sourceCount === 0 ? "No stashes." : "No matching stashes.",
		inactiveHints: [
			[
				["/", "filter"],
				["Ctrl+P/N", "move"],
				["Arrows/Page", "move"],
			],
			[
				["/", "filter"],
				["Ctrl+P/N/Arrows", "move"],
			],
			[
				["/", "filter"],
				["Ctrl+P/N", "move"],
			],
		],
		footerHints: [
			[
				["Enter", "pop"],
				["Ctrl+A", "apply"],
				["Ctrl+X", "drop"],
				["Esc", "cancel"],
			],
			[
				["Enter", "pop"],
				["^A", "apply"],
				["^X", "drop"],
				["Esc", "cancel"],
			],
			[
				["Enter", ""],
				["^A", ""],
				["^X", ""],
				["Esc", ""],
			],
		],
		divider: true,
		confirmAction: DEFAULT_STASH_ENTER_ACTION,
		resolveAction: (data) => {
			if (matchesKey(data, Key.ctrl("a"))) return "apply";
			if (matchesKey(data, Key.ctrl("x"))) return "drop";
			return undefined;
		},
		result: (item, action, context) => {
			const selectionAfterDrop =
				action === "drop" && context.filtered.length > 1
					? context.filtered[
							context.selectedIndex === 0
								? 1
								: context.selectedIndex - 1
						]?.id
					: undefined;
			return {
				item,
				action,
				...(selectionAfterDrop === undefined
					? {}
					: { selectionAfterDrop }),
			};
		},
		initialSelectedIdentity:
			selected === undefined
				? undefined
				: stashIdentityValue(selected),
	});
}

class PickerInputController implements Component, Focusable {
	private readonly picker: PromptPicker;

	constructor(picker: PromptPicker) {
		this.picker = picker;
	}

	get focused(): boolean {
		return this.picker.focused;
	}

	set focused(value: boolean) {
		this.picker.focused = value;
	}

	handleInput(data: string): void {
		this.picker.handleInput(data);
	}

	render(): string[] {
		return [];
	}

	invalidate(): void {
		this.picker.invalidate();
	}
}

type PickerFactory = (
	tui: TUI,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: PickerResult | null) => void,
) => PromptPicker;

function openPicker(
	ctx: ExtensionContext,
	createPicker: PickerFactory,
	signal?: AbortSignal,
): Promise<PickerResult | null> {
	if (signal?.aborted) return Promise.resolve(null);

	let cleanup = (): void => {};
	let custom: Promise<PickerResult | null>;
	try {
		custom = ctx.ui.custom<PickerResult | null>(
			(_tui, _theme, keybindings, done) => {
				let picker: PromptPicker | undefined;
				let settled = false;
				let cleaned = false;
				let removeAbortListener = (): void => {};
				const cleanupOnce = (): void => {
					if (cleaned) return;
					cleaned = true;
					removeAbortListener();
					picker?.dispose();
					ctx.ui.setWidget(PI_HISTORY_WIDGET_KEY, undefined);
				};
				cleanup = cleanupOnce;
				const finish = (result: PickerResult | null): void => {
					if (settled) return;
					settled = true;
					cleanupOnce();
					done(result);
				};
				ctx.ui.setWidget(
					PI_HISTORY_WIDGET_KEY,
					(tui, theme) => {
						picker = createPicker(tui, theme, keybindings, finish);
						return picker;
					},
					{ placement: "aboveEditor" },
				);
				if (!picker) throw new Error("pi-history picker widget was not created");
				if (signal) {
					const onAbort = (): void => finish(null);
					signal.addEventListener("abort", onAbort, { once: true });
					removeAbortListener = () => {
						signal.removeEventListener("abort", onAbort);
						removeAbortListener = () => {};
					};
					if (signal.aborted) finish(null);
				}
				return new PickerInputController(picker);
			},
			{
				overlay: true,
				overlayOptions: { anchor: "top-left", width: 1 },
			},
		);
	} catch (error) {
		cleanup();
		return Promise.reject(error);
	}
	return custom.finally(() => cleanup());
}

export function openStashPicker(
	ctx: ExtensionContext,
	items: readonly PromptItem[],
	selected?: PromptItem["id"],
	signal?: AbortSignal,
): Promise<PickerResult | null> {
	return openPicker(
		ctx,
		(tui, theme, keybindings, done) =>
			createStashPicker(
				tui,
				theme,
				keybindings,
				done,
				ctx.cwd,
				items,
				selected,
			),
		signal,
	);
}

export interface HistoryIndexView {
	getIndexState(cwd: string): IndexState;
	subscribe(cwd: string, listener: (state: IndexState) => void): () => void;
}

function highlighted(text: string, query: string, theme: Theme): string {
	const indexes = promptMatchIndexes(text, query);
	if (indexes.size === 0) return text;

	let result = "";
	let start = 0;
	let active = indexes.has(0);
	for (let index = 1; index <= text.length; index += 1) {
		const next = index < text.length && indexes.has(index);
		if (index < text.length && next === active) continue;
		const part = text.slice(start, index);
		result += active ? theme.fg("searchMatchText", theme.bold(part)) : part;
		start = index;
		active = next;
	}
	return result;
}

function historyLabel(item: PromptItem, query: string, theme: Theme): string {
	const sessionName = sanitizePlainTerminalText(item.sessionName ?? "");
	const image = item.hasImages ? theme.fg("warning", "🖼") : "";
	const source = sessionName
		? `${theme.bold(
				theme.fg(
					"accent",
					highlighted(sessionName, query, theme),
				),
			)}${image ? ` ${image}` : ""}`
		: image;
	const prompt = highlighted(
		sanitizePlainTerminalText(item.text),
		query,
		theme,
	);
	return [
		styledMetadata(theme, dateLabel(item.timestamp)),
		source,
		prompt,
	]
		.filter(Boolean)
		.join(` ${formatSeparator(theme)} `);
}

function historyIdentity(item: PromptItem): string {
	return JSON.stringify([
		item.sessionPath ?? "",
		typeof item.id,
		String(item.id),
	]);
}

function historyProgressLabel(state: IndexState): string | undefined {
	const progress = state.progress;
	if (!progress) return undefined;
	const target = progress.phase === "sessions" ? "sessions" : "prompts";
	return `Indexing ${target} ${progress.loaded}/${progress.total}…`;
}

export function createHistoryPicker(
	tui: TUI,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: PickerResult | null) => void,
	cwd: string,
	queryItems: () => readonly PromptItem[],
	index: HistoryIndexView,
	onTerminalEmptyChange?: (terminalEmpty: boolean) => void,
): PromptPicker {
	let state = index.getIndexState(cwd);
	let sourceItems = [...queryItems()];
	let terminalEmptyNotified = false;
	let unsubscribe: (() => void) | undefined;
	let disposeRequested = false;
	let picker: PromptPicker;

	const isTerminallyEmpty = (): boolean =>
		sourceItems.length === 0 && !state.active;
	const checkTerminalEmpty = (): void => {
		if (!isTerminallyEmpty()) {
			if (terminalEmptyNotified) onTerminalEmptyChange?.(false);
			terminalEmptyNotified = false;
			return;
		}
		if (terminalEmptyNotified) return;
		terminalEmptyNotified = true;
		onTerminalEmptyChange?.(true);
	};

	picker = new PromptPicker(tui, theme, keybindings, done, sourceItems, {
		title: "Prompt History",
		info: () => displayCwd(cwd),
		inputPrompt: "Search: ",
		inputPlaceholder: "prompt text or session name",
		filterInitiallyActive: true,
		search: (items, query) =>
			searchPrompts(items, query, HISTORY_RESULT_LIMIT),
		identity: historyIdentity,
		renderItem: (item, query, pickerTheme) => ({
			label: historyLabel(item, query, pickerTheme),
		}),
		layoutFactory: singleColumnListLayout,
		descriptionStyle: (text, pickerTheme) =>
			pickerTheme.fg("muted", text),
		emptyText: ({ sourceCount }) =>
			state.active
				? "Waiting for indexed prompts…"
				: sourceCount === 0
					? "No prompt history found."
					: "No matching prompts.",
		statusText: () => historyProgressLabel(state),
		footerHints: [
			[
				["Enter", "apply"],
				["Ctrl+P/N", "move"],
				["Arrows", "move"],
				["Page Up/Down", "move"],
				["Esc", "cancel"],
			],
			[
				["Enter", "apply"],
				["Ctrl+P/N/Arrows", "move"],
				["PgUp/PgDn", "page"],
				["Esc", "cancel"],
			],
			[
				["Enter", ""],
				["Ctrl+P/N", ""],
				["PgUp/PgDn", ""],
				["Esc", ""],
			],
		],
		confirmAction: "apply",
		result: (item) => ({ item, action: "apply" }),
		dispose: () => {
			if (!unsubscribe) {
				disposeRequested = true;
				return;
			}
			unsubscribe();
			unsubscribe = undefined;
		},
		isTerminallyEmpty,
	});

	unsubscribe = index.subscribe(cwd, (nextState) => {
		state = nextState;
		sourceItems = [...queryItems()];
		picker.replaceItems(sourceItems);
		checkTerminalEmpty();
	});
	if (disposeRequested) {
		unsubscribe();
		unsubscribe = undefined;
	}
	checkTerminalEmpty();
	return picker;
}

export function openHistoryPicker(
	ctx: ExtensionContext,
	queryItems: () => readonly PromptItem[],
	index: HistoryIndexView,
	onTerminalEmptyChange?: (terminalEmpty: boolean) => void,
	signal?: AbortSignal,
): Promise<PickerResult | null> {
	return openPicker(
		ctx,
		(tui, theme, keybindings, done) =>
			createHistoryPicker(
				tui,
				theme,
				keybindings,
				done,
				ctx.cwd,
				queryItems,
				index,
				onTerminalEmptyChange,
			),
		signal,
	);
}
