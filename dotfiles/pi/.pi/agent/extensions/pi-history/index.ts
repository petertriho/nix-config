import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type EditorComponent,
	matchesKey,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import {
	findVimMode,
	HISTORY_SHORTCUT,
	type PickerResult,
	type PromptItem,
	promptPreview,
	promptSourceLabel,
	STASH_SHORTCUT,
	sanitizePlainTerminalText,
} from "./model.ts";
import {
	type HistoryIndexView,
	openHistoryPicker as openHistoryPickerUi,
	openStashPicker as openStashPickerUi,
	PI_HISTORY_WIDGET_KEY,
} from "./picker.ts";
import {
	type ApplyMutation,
	type ApplyMutationResult,
	type LiveSession,
	PiHistoryStore,
} from "./store.ts";
import {
	applyPanelMargin,
	formatSavedCount,
	renderPanelBottom,
	renderPanelRow,
	renderPanelTop,
	safeWidth,
	span,
} from "./ui.ts";

const HISTORY_LAYER = Symbol.for("pi-history/editor-layer");
const HISTORY_INSTANCE = Symbol.for("pi-history/editor-instance");
const HISTORY_PRELOAD = Symbol.for("pi-history/editor-preload");
const SHELL_FRAME = Symbol.for("pi-tui-shell-frame");

type EditorFactory = NonNullable<
	ReturnType<ExtensionContext["ui"]["getEditorComponent"]>
>;
type EditorTarget = Pick<
	EditorComponent,
	"getText" | "setText" | "getExpandedText"
>;

type TaggedFactory = EditorFactory & {
	[HISTORY_LAYER]?: {
		owner: symbol;
		previous: EditorFactory | undefined;
	};
};

type ShellFactory = EditorFactory & {
	[SHELL_FRAME]?: {
		inner: EditorFactory | undefined;
	};
};

type TaggedEditor = EditorComponent & {
	[HISTORY_INSTANCE]?: {
		owner: symbol;
		originalHandleInput: (data: string) => void;
	};
	[HISTORY_PRELOAD]?: Set<string>;
};

export interface PiHistoryStoreLike extends HistoryIndexView {
	insertStash(text: string, cwd: string): number;
	listStashes(cwd: string): PromptItem[];
	deleteStash(id: number, cwd: string): boolean;
	mutateForApply(input: ApplyMutation): ApplyMutationResult;
	listHistory(cwd: string, live?: LiveSession): PromptItem[];
	refreshHistory(cwd: string, options?: { force?: boolean }): Promise<void>;
	close(): Promise<void>;
}

export interface PiHistoryDependencies {
	createStore(): PiHistoryStoreLike;
	openStashPicker(
		ctx: ExtensionContext,
		items: readonly PromptItem[],
		selected?: PromptItem["id"],
		signal?: AbortSignal,
	): Promise<PickerResult | null>;
	openHistoryPicker(
		ctx: ExtensionContext,
		queryItems: () => readonly PromptItem[],
		index: HistoryIndexView,
		onTerminalEmptyChange?: (terminalEmpty: boolean) => void,
		signal?: AbortSignal,
	): Promise<PickerResult | null>;
	timers?: PiHistoryTimers;
}

export interface PiHistoryTimers {
	setTimeout(
		callback: () => void,
		delay: number,
	): ReturnType<typeof setTimeout>;
	clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

const defaultDependencies: PiHistoryDependencies = {
	createStore: () => new PiHistoryStore(),
	openStashPicker: openStashPickerUi,
	openHistoryPicker: openHistoryPickerUi,
};

const WIDGET_FEEDBACK_MS = 3_000;
const defaultTimers: PiHistoryTimers = {
	setTimeout,
	clearTimeout,
};

type WidgetFeedback = Readonly<{
	tone: "success" | "info" | "empty";
	label: string;
	preview?: string;
	detail?: string;
}>;

function errorMessage(error: unknown): string {
	return sanitizePlainTerminalText(
		error instanceof Error ? error.message : String(error),
	);
}

function logicalFactory(
	factory: EditorFactory | undefined,
): EditorFactory | undefined {
	return (factory as ShellFactory | undefined)?.[SHELL_FRAME]?.inner ?? factory;
}

function ownsFactory(
	current: EditorFactory | undefined,
	owned: EditorFactory | undefined,
): boolean {
	if (!owned) return false;
	return current === owned || logicalFactory(current) === owned;
}

function liveSession(ctx: ExtensionContext): LiveSession {
	return {
		sessionPath:
			ctx.sessionManager.getSessionFile() ??
			`memory:${ctx.sessionManager.getSessionId()}`,
		sessionName: ctx.sessionManager.getSessionName(),
		entries: ctx.sessionManager.getEntries(),
	};
}

function branchPrompts(
	ctx: ExtensionContext,
): Array<{ id: string; text: string }> {
	return ctx.sessionManager.getBranch().flatMap((entry) => {
		if (
			entry.type !== "message" ||
			entry.message.role !== "user" ||
			typeof entry.id !== "string"
		) {
			return [];
		}
		const content = entry.message.content;
		const text =
			typeof content === "string"
				? content.trim()
				: Array.isArray(content)
					? content
							.flatMap((part) =>
								part.type === "text" && typeof part.text === "string"
									? [part.text.trim()]
									: [],
							)
							.filter(Boolean)
							.join("\n")
							.trim()
					: "";
		return text ? [{ id: entry.id, text }] : [];
	});
}

export default function piHistory(
	pi: ExtensionAPI,
	dependencies: PiHistoryDependencies = defaultDependencies,
): void {
	const owner = Symbol("pi-history-owner");
	const timers = dependencies.timers ?? defaultTimers;
	let store: PiHistoryStoreLike | undefined;
	let activeEditor: TaggedEditor | undefined;
	let ownedFactory: TaggedFactory | undefined;
	let previousFactory: EditorFactory | undefined;
	let unsubscribeStore: (() => void) | undefined;
	let actionRunning = false;
	let sessionActive = false;
	let sessionGeneration = 0;
	let pickerAbortController = new AbortController();
	let pickerActive = false;
	let widgetFeedback: WidgetFeedback | undefined;
	let feedbackPendingVisibility = false;
	let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
	const patchedEditors = new Set<TaggedEditor>();

	const notifyFailure = (ctx: ExtensionContext, error: unknown) => {
		ctx.ui.notify(`pi-history: ${errorMessage(error)}`, "error");
	};

	const targetFor = (ctx: ExtensionContext): EditorTarget =>
		activeEditor ?? {
			getText: () => ctx.ui.getEditorText(),
			setText: (text) => ctx.ui.setEditorText(text),
		};

	const clearFeedbackTimer = (): void => {
		if (feedbackTimer === undefined) return;
		timers.clearTimeout(feedbackTimer);
		feedbackTimer = undefined;
	};

	const updateWidget = (ctx: ExtensionContext): void => {
		if (ctx.mode !== "tui" || !sessionActive) return;
		if (pickerActive) return;
		const currentStore = store;
		if (!currentStore) {
			ctx.ui.setWidget(PI_HISTORY_WIDGET_KEY, undefined);
			return;
		}
		const items = currentStore.listStashes(ctx.cwd);
		const latest = items[0];
		const feedback = widgetFeedback;
		if (!latest && !feedback) {
			ctx.ui.setWidget(PI_HISTORY_WIDGET_KEY, undefined);
			return;
		}
		const savedCount = formatSavedCount(items.length);
		const latestPreview = latest
			? sanitizePlainTerminalText(latest.text)
			: undefined;
		const feedbackSnapshot = feedback
			? {
					...feedback,
					label: sanitizePlainTerminalText(feedback.label),
					preview: feedback.preview
						? sanitizePlainTerminalText(feedback.preview)
						: undefined,
					detail: feedback.detail
						? sanitizePlainTerminalText(feedback.detail)
						: undefined,
				}
			: undefined;
		ctx.ui.setWidget(
			PI_HISTORY_WIDGET_KEY,
			(_tui, theme) => ({
				render: (width: number) => {
					const available = safeWidth(width);
					const panelWidth = Math.max(0, available - 2);
					const previewWidth = Math.max(0, panelWidth - 4);
					let body = latestPreview ? span(theme, "text", latestPreview) : "";
					if (feedbackSnapshot) {
						const presentation =
							feedbackSnapshot.tone === "success"
								? { glyph: "✓", token: "success" as const }
								: feedbackSnapshot.tone === "empty"
									? { glyph: "!", token: "warning" as const }
									: { glyph: "•", token: "accent" as const };
						const parts = [
							span(
								theme,
								presentation.token,
								`${presentation.glyph} ${feedbackSnapshot.label}`,
							),
							feedbackSnapshot.preview
								? span(theme, "text", feedbackSnapshot.preview)
								: "",
							feedbackSnapshot.detail
								? span(theme, "muted", feedbackSnapshot.detail)
								: "",
						].filter(Boolean);
						body = parts.join(` ${span(theme, "dim", "·")} `);
					}
					const fittedBody = truncateToWidth(
						body,
						previewWidth,
						previewWidth > 1 ? "…" : "",
					);
					return applyPanelMargin(
						[
							renderPanelTop(
								theme,
								panelWidth,
								"Prompt stash",
								savedCount,
							),
							renderPanelRow(theme, panelWidth, fittedBody),
							renderPanelBottom(theme, panelWidth),
						],
						available,
					);
				},
				invalidate() {},
			}),
		);
	};

	const startFeedbackTimer = (
		ctx: ExtensionContext,
		generation = sessionGeneration,
	): void => {
		clearFeedbackTimer();
		feedbackPendingVisibility = false;
		const timerGeneration = generation;
		feedbackTimer = timers.setTimeout(() => {
			feedbackTimer = undefined;
			if (!sessionActive || timerGeneration !== sessionGeneration) return;
			widgetFeedback = undefined;
			updateWidget(ctx);
		}, WIDGET_FEEDBACK_MS);
	};

	const showRoutineInfo = (
		ctx: ExtensionContext,
		feedback: WidgetFeedback,
		fallbackMessage: string,
		generation = sessionGeneration,
	): void => {
		if (ctx.mode !== "tui") {
			ctx.ui.notify(fallbackMessage, "info");
			return;
		}
		if (!sessionActive || generation !== sessionGeneration) return;

		clearFeedbackTimer();
		widgetFeedback = feedback;
		if (pickerActive) {
			feedbackPendingVisibility = true;
			return;
		}
		updateWidget(ctx);
		startFeedbackTimer(ctx, generation);
	};

	const applyPrompt = (
		ctx: ExtensionContext,
		target: EditorTarget,
		item: PromptItem,
		action: "apply" | "pop",
		generation = sessionGeneration,
	): void => {
		const currentStore = store;
		if (!currentStore) throw new Error("store is not available");
		const currentDraft = target.getExpandedText?.() ?? target.getText();
		const mutation = currentStore.mutateForApply({
			cwd: ctx.cwd,
			currentDraft,
			replacementText: item.text,
			...(action === "pop" && typeof item.id === "number"
				? { poppedStashId: item.id }
				: {}),
		});
		target.setText(item.text);
		const label = action === "pop" ? "Popped" : "Applied";
		const detail = mutation.autoStashed
			? "current draft auto-stashed"
			: undefined;
		const fallback = `${label} ${promptSourceLabel(item)}${
			detail ? `; ${detail}` : ""
		}`;
		showRoutineInfo(
			ctx,
			{
				tone: "success",
				label,
				preview: item.text,
				...(detail ? { detail } : {}),
			},
			fallback,
			generation,
		);
	};

	const runGuarded = async (
		ctx: ExtensionContext,
		action: () => Promise<void> | void,
	): Promise<void> => {
		if (actionRunning) {
			ctx.ui.notify("pi-history action already in progress.", "warning");
			return;
		}
		const guardGeneration = sessionGeneration;
		actionRunning = true;
		try {
			await action();
		} catch (error) {
			if (sessionActive && guardGeneration === sessionGeneration) {
				notifyFailure(ctx, error);
			}
		} finally {
			if (guardGeneration === sessionGeneration) actionRunning = false;
		}
	};

	const beginPicker = (ctx: ExtensionContext): void => {
		clearFeedbackTimer();
		if (widgetFeedback) feedbackPendingVisibility = true;
		pickerActive = true;
		if (ctx.mode === "tui") {
			ctx.ui.setWidget(PI_HISTORY_WIDGET_KEY, undefined);
		}
	};

	const finishPicker = (
		ctx: ExtensionContext,
		generation: number,
	): void => {
		if (generation !== sessionGeneration) return;
		pickerActive = false;
		if (!sessionActive) return;
		updateWidget(ctx);
		if (feedbackPendingVisibility && widgetFeedback) {
			startFeedbackTimer(ctx, generation);
		}
	};

	const runStashAction = async (
		ctx: ExtensionContext,
		target: EditorTarget,
	): Promise<void> => {
		const actionGeneration = sessionGeneration;
		const currentStore = store;
		if (!currentStore) throw new Error("store is not available");
		const current = target.getExpandedText?.() ?? target.getText();
		if (current.trim()) {
			currentStore.insertStash(current, ctx.cwd);
			target.setText("");
			showRoutineInfo(
				ctx,
				{ tone: "success", label: "Stashed", preview: current },
				`Stashed: ${promptPreview(current, 60)}`,
				actionGeneration,
			);
			return;
		}

		let items = currentStore.listStashes(ctx.cwd);
		if (items.length === 0) {
			showRoutineInfo(
				ctx,
				{ tone: "empty", label: "No stashes" },
				"No stashes.",
				actionGeneration,
			);
			return;
		}
		if (items.length === 1) {
			const item = items[0];
			if (!item) return;
			applyPrompt(ctx, target, item, "pop", actionGeneration);
			return;
		}

		beginPicker(ctx);
		try {
			let selected: PromptItem["id"] | undefined;
			for (;;) {
				const result = await dependencies.openStashPicker(
					ctx,
					items,
					selected,
					pickerAbortController.signal,
				);
				if (!sessionActive || actionGeneration !== sessionGeneration) return;
				if (!result) return;
				if (result.action === "drop") {
					if (
						typeof result.item.id !== "number" ||
						!currentStore.deleteStash(result.item.id, ctx.cwd)
					) {
						throw new Error("selected stash no longer exists");
					}
					showRoutineInfo(
						ctx,
						{
							tone: "success",
							label: "Dropped",
							preview: result.item.text,
						},
						`Dropped ${promptSourceLabel(result.item)}`,
						actionGeneration,
					);
					items = currentStore.listStashes(ctx.cwd);
					if (items.length === 0) return;
					selected = result.selectionAfterDrop;
					continue;
				}
				applyPrompt(
					ctx,
					target,
					result.item,
					result.action,
					actionGeneration,
				);
				return;
			}
		} finally {
			finishPicker(ctx, actionGeneration);
		}
	};

	const runHistoryAction = async (
		ctx: ExtensionContext,
		target: EditorTarget,
	): Promise<void> => {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Prompt history is only available in TUI mode.", "info");
			return;
		}
		const actionGeneration = sessionGeneration;
		const currentStore = store;
		if (!currentStore) throw new Error("store is not available");
		void currentStore.refreshHistory(ctx.cwd).catch((error) => {
			if (!sessionActive || actionGeneration !== sessionGeneration) return;
			notifyFailure(ctx, error);
		});
		const query = () => currentStore.listHistory(ctx.cwd, liveSession(ctx));
		if (query().length === 0 && !currentStore.getIndexState(ctx.cwd).active) {
			showRoutineInfo(
				ctx,
				{ tone: "empty", label: "No prompt history found" },
				"No prompt history found.",
				actionGeneration,
			);
			return;
		}
		let terminalEmpty = false;
		beginPicker(ctx);
		try {
			const result = await dependencies.openHistoryPicker(
				ctx,
				query,
				currentStore,
				(nextTerminalEmpty) => {
					terminalEmpty = nextTerminalEmpty;
				},
				pickerAbortController.signal,
			);
			if (!sessionActive || actionGeneration !== sessionGeneration) return;
			if (result) {
				applyPrompt(
					ctx,
					target,
					result.item,
					"apply",
					actionGeneration,
				);
			}
		} finally {
			if (
				sessionActive &&
				actionGeneration === sessionGeneration &&
				terminalEmpty
			) {
				showRoutineInfo(
					ctx,
					{ tone: "empty", label: "No prompt history found" },
					"No prompt history found.",
					actionGeneration,
				);
			}
			finishPicker(ctx, actionGeneration);
		}
	};

	const patchEditor = (
		editor: EditorComponent,
		ctx: ExtensionContext,
	): TaggedEditor => {
		const tagged = editor as TaggedEditor;
		const existing = tagged[HISTORY_INSTANCE];
		const originalHandleInput =
			existing?.originalHandleInput ?? editor.handleInput.bind(editor);
		tagged[HISTORY_INSTANCE] = { owner, originalHandleInput };

		const preloaded = tagged[HISTORY_PRELOAD] ?? new Set<string>();
		tagged[HISTORY_PRELOAD] = preloaded;
		const sessionId = ctx.sessionManager.getSessionId();
		for (const prompt of branchPrompts(ctx)) {
			const identity = `${sessionId}\u0000${prompt.id}`;
			if (preloaded.has(identity)) continue;
			editor.addToHistory?.(prompt.text);
			preloaded.add(identity);
		}

		editor.handleInput = (data: string): void => {
			if (matchesKey(data, STASH_SHORTCUT)) {
				void runGuarded(ctx, () => runStashAction(ctx, tagged));
				return;
			}
			if (matchesKey(data, HISTORY_SHORTCUT)) {
				const mode = findVimMode(tagged);
				if (mode === undefined || mode === "insert" || mode === "replace") {
					void runGuarded(ctx, () => runHistoryAction(ctx, tagged));
					return;
				}
			}
			originalHandleInput(data);
		};
		activeEditor = tagged;
		patchedEditors.add(tagged);
		return tagged;
	};

	const installEditorLayer = (ctx: ExtensionContext): void => {
		if (ctx.mode !== "tui") return;
		const current = ctx.ui.getEditorComponent();
		const logical = logicalFactory(current) as TaggedFactory | undefined;
		if (logical?.[HISTORY_LAYER]?.owner === owner) return;

		previousFactory = logical?.[HISTORY_LAYER]?.previous ?? current;
		const factory: TaggedFactory = (tui, theme, keybindings) => {
			const editor =
				previousFactory?.(tui, theme, keybindings) ??
				new CustomEditor(tui, theme, keybindings);
			return patchEditor(editor, ctx);
		};
		factory[HISTORY_LAYER] = { owner, previous: previousFactory };
		ownedFactory = factory;
		ctx.ui.setEditorComponent(factory);
	};

	const restoreEditorLayer = (ctx: ExtensionContext): void => {
		const current = ctx.ui.getEditorComponent();
		if (ownsFactory(current, ownedFactory)) {
			ctx.ui.setEditorComponent(previousFactory);
		}
		for (const editor of patchedEditors) {
			const tag = editor[HISTORY_INSTANCE];
			if (tag?.owner === owner) {
				editor.handleInput = tag.originalHandleInput;
				delete editor[HISTORY_INSTANCE];
			}
		}
		patchedEditors.clear();
		activeEditor = undefined;
		ownedFactory = undefined;
		previousFactory = undefined;
	};

	pi.registerCommand("history", {
		description: "Search and apply prompt history",
		handler: async (_args, ctx) => {
			await runGuarded(ctx, () => runHistoryAction(ctx, targetFor(ctx)));
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		actionRunning = false;
		clearFeedbackTimer();
		pickerAbortController.abort();
		pickerAbortController = new AbortController();
		pickerActive = false;
		widgetFeedback = undefined;
		feedbackPendingVisibility = false;
		sessionGeneration += 1;
		sessionActive = true;
		const startGeneration = sessionGeneration;
		try {
			store = dependencies.createStore();
			const seenWarnings = new Set<string>();
			unsubscribeStore = store.subscribe(ctx.cwd, (state) => {
				for (const warning of state.warnings) {
					if (seenWarnings.has(warning)) continue;
					seenWarnings.add(warning);
					ctx.ui.notify(
						`pi-history: ${sanitizePlainTerminalText(warning)}`,
						"warning",
					);
				}
			});
			updateWidget(ctx);
			void store.refreshHistory(ctx.cwd).catch((error) => {
				if (!sessionActive || startGeneration !== sessionGeneration) return;
				notifyFailure(ctx, error);
			});
		} catch (error) {
			store = undefined;
			notifyFailure(ctx, error);
			if (ctx.mode === "tui") {
				ctx.ui.setWidget(PI_HISTORY_WIDGET_KEY, undefined);
			}
		}
	});

	pi.on("resources_discover", (_event, ctx) => {
		installEditorLayer(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		sessionActive = false;
		sessionGeneration += 1;
		pickerAbortController.abort();
		clearFeedbackTimer();
		pickerActive = false;
		widgetFeedback = undefined;
		feedbackPendingVisibility = false;
		restoreEditorLayer(ctx);
		unsubscribeStore?.();
		unsubscribeStore = undefined;
		if (ctx.mode === "tui") {
			ctx.ui.setWidget(PI_HISTORY_WIDGET_KEY, undefined);
		}
		const closingStore = store;
		store = undefined;
		if (closingStore) {
			try {
				await closingStore.close();
			} catch (error) {
				notifyFailure(ctx, error);
			}
		}
		actionRunning = false;
	});
}
