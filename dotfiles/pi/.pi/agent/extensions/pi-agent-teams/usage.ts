import { calculateContextTokens } from "@earendil-works/pi-coding-agent";

/**
 * Minimal structural view of a session entry for usage aggregation. Accepts
 * entries from both Pi session files and the local session module without
 * coupling their full types.
 */
export interface UsageEntryLike {
	type?: string;
	message?: unknown;
	thinkingLevel?: unknown;
}

export interface SubagentUsageSummary {
	requests: number;
	input?: number;
	output?: number;
	total?: number;
	contextTokens?: number;
	contextWindow?: number;
	contextRatio?: number;
	provider?: string;
	model?: string;
	thinking?: string;
	cacheRead?: number;
	cacheWrite?: number;
	skippedInvalidUsage: number;
}

interface AssistantUsage {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
}

const COMPLETED_STOPS = new Set(["stop", "length", "toolUse"]);

function isFiniteNonNegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function totalFromComponents(usage: AssistantUsage): number | undefined {
	const values = [usage.input, usage.output, usage.cacheRead, usage.cacheWrite];
	if (values.some((value) => value !== undefined && !isFiniteNonNegative(value))) {
		return undefined;
	}
	return (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
}

function hasMalformedUsage(usage: AssistantUsage | undefined): boolean {
	if (!usage) return false;
	if (usage.totalTokens !== undefined && !isFiniteNonNegative(usage.totalTokens)) return true;
	const componentValues = [usage.input, usage.output, usage.cacheRead, usage.cacheWrite];
	return componentValues.some(
		(value) => value !== undefined && !isFiniteNonNegative(value),
	);
}

interface UsageAccumulator {
	requests: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
	contextTokens?: number;
	provider?: string;
	model?: string;
	thinking?: string;
	hasInput: boolean;
	hasOutput: boolean;
	hasCacheRead: boolean;
	hasCacheWrite: boolean;
	hasTotal: boolean;
	skippedInvalidUsage: number;
}

interface AssistantCandidate {
	role?: string;
	stopReason?: string;
	usage?: AssistantUsage;
	provider?: string;
	model?: string;
	thinkingLevel?: string;
}

function newUsageAccumulator(): UsageAccumulator {
	return {
		requests: 0,
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
		hasInput: false,
		hasOutput: false,
		hasCacheRead: false,
		hasCacheWrite: false,
		hasTotal: false,
		skippedInvalidUsage: 0,
	};
}

function addUsageComponents(accumulator: UsageAccumulator, usage: AssistantUsage): void {
	if (usage.input !== undefined) {
		accumulator.hasInput = true;
		accumulator.input += usage.input;
	}
	if (usage.output !== undefined) {
		accumulator.hasOutput = true;
		accumulator.output += usage.output;
	}
	if (usage.cacheRead !== undefined) {
		accumulator.hasCacheRead = true;
		accumulator.cacheRead += usage.cacheRead;
	}
	if (usage.cacheWrite !== undefined) {
		accumulator.hasCacheWrite = true;
		accumulator.cacheWrite += usage.cacheWrite;
	}
}

function messageTotalTokens(usage: AssistantUsage | undefined): number | undefined {
	if (!usage) return undefined;
	if (usage.totalTokens !== undefined) return usage.totalTokens;
	return totalFromComponents(usage);
}

function messageContextTokens(usage: AssistantUsage): number | undefined {
	try {
		const estimate = calculateContextTokens(usage as Parameters<typeof calculateContextTokens>[0]);
		return Number.isFinite(estimate) && estimate >= 0 ? estimate : undefined;
	} catch {
		return totalFromComponents(usage);
	}
}

function toUsageSummary(accumulator: UsageAccumulator): SubagentUsageSummary {
	const summary: SubagentUsageSummary = {
		requests: accumulator.requests,
		skippedInvalidUsage: accumulator.skippedInvalidUsage,
	};
	if (accumulator.hasInput) summary.input = accumulator.input;
	if (accumulator.hasOutput) summary.output = accumulator.output;
	if (accumulator.hasTotal) summary.total = accumulator.total;
	if (accumulator.contextTokens !== undefined) summary.contextTokens = accumulator.contextTokens;
	if (accumulator.provider) summary.provider = accumulator.provider;
	if (accumulator.model) summary.model = accumulator.model;
	if (accumulator.thinking) summary.thinking = accumulator.thinking;
	if (accumulator.hasCacheRead) summary.cacheRead = accumulator.cacheRead;
	if (accumulator.hasCacheWrite) summary.cacheWrite = accumulator.cacheWrite;
	return summary;
}

export function summarizeSubagentUsage(
	entries: readonly UsageEntryLike[],
): SubagentUsageSummary {
	const accumulator = newUsageAccumulator();
	let hasThinkingLevelChange = false;

	for (const entry of entries) {
		if (entry.type === "thinking_level_change") {
			if (typeof entry.thinkingLevel === "string" && entry.thinkingLevel.length > 0) {
				accumulator.thinking = entry.thinkingLevel;
				hasThinkingLevelChange = true;
			}
			continue;
		}
		if (entry.type !== "message") continue;
		const candidate = entry.message as AssistantCandidate;
		if (candidate.role !== "assistant") continue;
		if (!COMPLETED_STOPS.has(candidate.stopReason ?? "")) continue;

		accumulator.requests += 1;
		const malformed = hasMalformedUsage(candidate.usage);
		if (malformed) accumulator.skippedInvalidUsage += 1;
		const usage = malformed ? undefined : candidate.usage;
		if (usage) {
			addUsageComponents(accumulator, usage);
			const contextTokens = messageContextTokens(usage);
			if (contextTokens !== undefined) accumulator.contextTokens = contextTokens;
		}
		const messageTotal = messageTotalTokens(usage);
		if (messageTotal !== undefined) {
			accumulator.hasTotal = true;
			accumulator.total += messageTotal;
		}
		if (candidate.provider) accumulator.provider = candidate.provider;
		if (candidate.model) accumulator.model = candidate.model;
		if (!hasThinkingLevelChange && candidate.thinkingLevel) {
			accumulator.thinking = candidate.thinkingLevel;
		}
	}

	return toUsageSummary(accumulator);
}

/** Compact token count for presentation, e.g. "1,234". */
function formatTokenCount(tokens: number): string {
	return tokens.toLocaleString("en-US");
}

/** Compact context-window size, e.g. "200k" or "1.5m". */
function formatContextWindowSize(tokens: number): string {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}m`;
	}
	return `${Math.max(1, Math.round(tokens / 1_000))}k`;
}

/**
 * Compact, provider-neutral presentation of a usage summary (T9).
 *
 * Shows requests, input, output, total, context pressure, cache fields,
 * provider/model identity, and thinking level — each only when available.
 * Cache fields appear only when the provider reported them. Returns
 * undefined when no completed requests exist so callers can omit the line.
 * Purely observational: never used for control flow or billing math.
 */
export function formatUsageSummary(
	summary: SubagentUsageSummary | undefined,
): string | undefined {
	if (!summary || summary.requests <= 0) return undefined;

	const parts: string[] = [
		`${summary.requests} ${summary.requests === 1 ? "request" : "requests"}`,
	];
	if (summary.input !== undefined) parts.push(`input ${formatTokenCount(summary.input)}`);
	if (summary.output !== undefined) parts.push(`output ${formatTokenCount(summary.output)}`);
	if (summary.total !== undefined) parts.push(`total ${formatTokenCount(summary.total)}`);
	if (summary.contextTokens !== undefined) {
		if (summary.contextWindow === undefined) {
			parts.push(`context ${formatTokenCount(summary.contextTokens)}`);
		} else {
			const ratio =
				typeof summary.contextRatio === "number" && Number.isFinite(summary.contextRatio)
					? summary.contextRatio
					: summary.contextTokens / summary.contextWindow;
			parts.push(
				`context ${formatTokenCount(summary.contextTokens)}/${formatContextWindowSize(summary.contextWindow)}`
				+ ` (${Math.round(ratio * 100)}%)`,
		);
		}
	}
	if (summary.cacheRead !== undefined) {
		parts.push(`cache read ${formatTokenCount(summary.cacheRead)}`);
	}
	if (summary.cacheWrite !== undefined) {
		parts.push(`cache write ${formatTokenCount(summary.cacheWrite)}`);
	}
	const identity = [summary.provider, summary.model]
		.filter((part): part is string => Boolean(part))
		.join("/");
	if (identity) parts.push(identity);
	if (summary.thinking) parts.push(`thinking ${summary.thinking}`);

	return `Usage: ${parts.join(" · ")}`;
}

export function withContextWindow(
	summary: SubagentUsageSummary,
	contextWindow: number | undefined,
): SubagentUsageSummary {
	if (
		contextWindow === undefined
		|| summary.contextTokens === undefined
		|| !Number.isFinite(contextWindow)
		|| contextWindow <= 0
	) {
		return summary;
	}
	return {
		...summary,
		contextWindow,
		contextRatio: summary.contextTokens / contextWindow,
	};
}
