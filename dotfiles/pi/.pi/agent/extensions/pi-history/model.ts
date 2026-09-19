import { fuzzyMatch, stripTerminalSequences } from "@earendil-works/pi-tui";

export const STASH_SHORTCUT = "ctrl+s";
export const HISTORY_SHORTCUT = "ctrl+r";
export const INCLUDE_SLASH_COMMANDS = true;
export const HISTORY_RESULT_LIMIT = 120;
export const PICKER_VISIBLE_ROWS = 10;
export const DEFAULT_STASH_ENTER_ACTION = "pop" as const;
export const REFRESH_THROTTLE_MS = 30_000;

export type PromptKind = "stash" | "history";
export type PromptAction = "apply" | "pop" | "drop";
export type VimMode =
	| "normal"
	| "insert"
	| "visual"
	| "visual-line"
	| "replace"
	| "command-line";

export interface PromptItem {
	kind: PromptKind;
	id: number | string;
	text: string;
	timestamp: number;
	cwd: string;
	sessionPath?: string;
	sessionName?: string;
	hasImages?: boolean;
}

export interface PickerResult {
	item: PromptItem;
	action: PromptAction;
	selectionAfterDrop?: PromptItem["id"];
}

export interface IndexProgress {
	phase: "sessions" | "prompts";
	loaded: number;
	total: number;
}

export interface PromptExtractionContext {
	cwd: string;
	sessionPath: string;
	sessionName?: string;
	fallbackTimestamp?: number;
	includeSlashCommands?: boolean;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: Removes terminal control bytes from untrusted display text.
const TERMINAL_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;

export function sanitizePlainTerminalText(value: string): string {
	return stripTerminalSequences(value)
		.replace(TERMINAL_CONTROL_PATTERN, " ")
		.replace(/\s+/gu, " ")
		.trim();
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

function contentBlocks(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.flatMap((part) => {
				const block = record(part);
				return block ? [block] : [];
			})
		: [];
}

export function extractPromptText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	return contentBlocks(value)
		.flatMap((part) =>
			part.type === "text" && typeof part.text === "string"
				? [part.text.trim()]
				: [],
		)
		.filter(Boolean)
		.join("\n");
}

export function contentHasImages(value: unknown): boolean {
	return contentBlocks(value).some((part) => part.type === "image");
}

export function promptTimestamp(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

export function isSlashCommand(text: string): boolean {
	return text.trimStart().startsWith("/");
}

export function extractUserPrompt(
	value: unknown,
	context: PromptExtractionContext,
): PromptItem | undefined {
	const entry = record(value);
	const message = record(entry?.message);
	if (
		entry?.type !== "message" ||
		typeof entry.id !== "string" ||
		message?.role !== "user"
	) {
		return undefined;
	}

	const text = extractPromptText(message.content);
	if (!text) return undefined;
	const includeSlashCommands =
		context.includeSlashCommands ?? INCLUDE_SLASH_COMMANDS;
	if (!includeSlashCommands && isSlashCommand(text)) return undefined;

	const fallbackTimestamp = context.fallbackTimestamp ?? Date.now();
	const entryTimestamp = promptTimestamp(entry.timestamp, fallbackTimestamp);
	const timestamp = promptTimestamp(message.timestamp, entryTimestamp);
	return {
		kind: "history",
		id: entry.id,
		text,
		timestamp,
		cwd: context.cwd,
		sessionPath: context.sessionPath,
		...(context.sessionName?.trim()
			? { sessionName: context.sessionName.trim() }
			: {}),
		hasImages: contentHasImages(message.content),
	};
}

export function promptPreview(value: string, max = 90): string {
	const compact = sanitizePlainTerminalText(value);
	const boundedMax = Math.max(0, Math.floor(max));
	if (compact.length <= boundedMax) return compact;
	if (boundedMax === 0) return "";
	return `${compact.slice(0, Math.max(0, boundedMax - 1))}…`;
}

export function promptSourceLabel(item: PromptItem): string {
	if (item.kind === "stash") return promptPreview(item.text, 48);
	return sanitizePlainTerminalText(item.sessionName ?? "") || "History";
}

function searchTokens(query: string): string[] {
	return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}

function searchableFields(
	item: PromptItem,
	includeCwd: boolean,
): readonly string[] {
	return [
		item.text,
		...(item.sessionName?.trim() ? [item.sessionName] : []),
		...(includeCwd ? [item.cwd] : []),
	];
}

type MatchRank = {
	tier: number;
	score: number;
};

function itemMatchRank(
	item: PromptItem,
	tokens: readonly string[],
	includeCwd: boolean,
): MatchRank | undefined {
	const phrase = tokens.join(" ");
	const fields = searchableFields(item, includeCwd).map((field) =>
		field.toLocaleLowerCase(),
	);
	const exactField = fields.indexOf(phrase);
	if (exactField >= 0) return { tier: 0, score: exactField };

	let bestSubstring = Number.POSITIVE_INFINITY;
	for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
		const phraseIndex = fields[fieldIndex]?.indexOf(phrase) ?? -1;
		if (phraseIndex >= 0) {
			bestSubstring = Math.min(
				bestSubstring,
				fieldIndex * 10_000 + phraseIndex,
			);
		}
	}
	if (Number.isFinite(bestSubstring)) {
		return { tier: 1, score: bestSubstring };
	}

	let score = 0;
	for (const token of tokens) {
		let bestTokenScore = Number.POSITIVE_INFINITY;
		for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
			const field = fields[fieldIndex] ?? "";
			const substringIndex = field.indexOf(token);
			if (substringIndex >= 0) {
				bestTokenScore = Math.min(
					bestTokenScore,
					fieldIndex * 10_000 + substringIndex,
				);
				continue;
			}
			const fuzzy = fuzzyMatch(token, field);
			if (fuzzy.matches) {
				bestTokenScore = Math.min(
					bestTokenScore,
					100_000 + fieldIndex * 10_000 + fuzzy.score,
				);
			}
		}
		if (!Number.isFinite(bestTokenScore)) return undefined;
		score += bestTokenScore;
	}
	return { tier: 2, score };
}

export function searchPrompts(
	items: readonly PromptItem[],
	query: string,
	limit = HISTORY_RESULT_LIMIT,
	options: { includeCwd?: boolean } = {},
): PromptItem[] {
	const boundedLimit = Math.max(0, Math.floor(limit));
	const tokens = searchTokens(query);
	if (tokens.length === 0) return items.slice(0, boundedLimit);

	return items
		.flatMap((item) => {
			const rank = itemMatchRank(item, tokens, options.includeCwd ?? false);
			return rank ? [{ item, rank }] : [];
		})
		.sort(
			(left, right) =>
				left.rank.tier - right.rank.tier ||
				left.rank.score - right.rank.score ||
				right.item.timestamp - left.item.timestamp,
		)
		.slice(0, boundedLimit)
		.map(({ item }) => item);
}

export function promptMatchIndexes(
	text: string,
	query: string,
): ReadonlySet<number> {
	const lower = text.toLocaleLowerCase();
	const indexes = new Set<number>();
	for (const token of searchTokens(query)) {
		let from = 0;
		while (from < lower.length) {
			const index = lower.indexOf(token, from);
			if (index < 0) break;
			for (let offset = 0; offset < token.length; offset += 1) {
				indexes.add(index + offset);
			}
			from = index + Math.max(1, token.length);
		}
	}
	return new Set([...indexes].sort((left, right) => left - right));
}

export function editorChain(editor: unknown): unknown[] {
	const chain: unknown[] = [];
	const seen = new Set<unknown>();
	let current = editor;
	while (
		current !== null &&
		typeof current === "object" &&
		!seen.has(current)
	) {
		seen.add(current);
		chain.push(current);
		current = (current as { inner?: unknown }).inner;
	}
	return chain;
}

export function findVimMode(editor: unknown): VimMode | undefined {
	const modes: ReadonlySet<string> = new Set([
		"normal",
		"insert",
		"visual",
		"visual-line",
		"replace",
		"command-line",
	]);
	for (const node of editorChain(editor)) {
		const mode = (node as { vimState?: { mode?: unknown } }).vimState?.mode;
		if (typeof mode === "string" && modes.has(mode)) return mode as VimMode;
	}
	return undefined;
}
