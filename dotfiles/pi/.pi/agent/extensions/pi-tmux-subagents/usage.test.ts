import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { summarizeSubagentUsage, formatUsageSummary, withContextWindow, type SubagentUsageSummary } from "./usage.ts";

function entry(
	role: string,
	stopReason: string,
	usage?: Record<string, number>,
	provider?: string,
	model?: string,
): SessionEntry {
	return {
		type: "message",
		id: `${role}-${stopReason}-${Math.random().toString(16).slice(2)}`,
		parentId: null,
		timestamp: "2026-08-27T00:00:00Z",
		message: {
			role,
			content: [],
			stopReason,
			usage,
			provider,
			model,
			timestamp: 0,
		},
	} as unknown as SessionEntry;
}

function thinkingEntry(thinkingLevel: string): SessionEntry {
	return {
		type: "thinking_level_change",
		id: `thinking-${thinkingLevel}-${Math.random().toString(16).slice(2)}`,
		parentId: null,
		timestamp: "2026-08-27T00:00:00Z",
		thinkingLevel,
	} as SessionEntry;
}

test("usage aggregation handles complete fields across assistant entries", () => {
	const entries = [
		entry("assistant", "stop", {
			input: 10,
			output: 20,
			cacheRead: 3,
			cacheWrite: 4,
			totalTokens: 37,
		}, "openai", "gpt"),
		entry("assistant", "toolUse", {
			input: 5,
			output: 6,
			cacheRead: 1,
			cacheWrite: 2,
			totalTokens: 14,
		}, "anthropic", "claude"),
	];
	assert.deepEqual(summarizeSubagentUsage(entries), {
		requests: 2,
		input: 15,
		output: 26,
		total: 51,
		contextTokens: 14,
		provider: "anthropic",
		model: "claude",
		cacheRead: 4,
		cacheWrite: 6,
		skippedInvalidUsage: 0,
	});
	assert.deepEqual(withContextWindow(summarizeSubagentUsage(entries), 100), {
		...summarizeSubagentUsage(entries),
		contextWindow: 100,
		contextRatio: 0.14,
	});
});

test("usage aggregation reads effective thinking from top-level session entries", () => {
	const entries = [
		thinkingEntry("low"),
		entry("assistant", "stop", {
			input: 10,
			output: 2,
			totalTokens: 12,
		}, "anthropic", "claude"),
		thinkingEntry("high"),
		entry("assistant", "stop", {
			input: 20,
			output: 3,
			totalTokens: 23,
		}, "anthropic", "claude"),
	];

	assert.deepEqual(summarizeSubagentUsage(entries), {
		requests: 2,
		input: 30,
		output: 5,
		total: 35,
		contextTokens: 23,
		provider: "anthropic",
		model: "claude",
		thinking: "high",
		skippedInvalidUsage: 0,
	});
});

test("the latest top-level thinking change wins in file order", () => {
	const assistant = entry("assistant", "stop", {
		input: 10,
		output: 2,
		totalTokens: 12,
	}, "openai", "gpt") as unknown as {
		message: { thinkingLevel?: string };
	};
	assistant.message.thinkingLevel = "minimal";

	const usage = summarizeSubagentUsage([
		assistant as unknown as SessionEntry,
		thinkingEntry("medium"),
		thinkingEntry("xhigh"),
	]);
	assert.equal(usage.thinking, "xhigh");
	assert.equal(usage.requests, 1);
	assert.equal(usage.total, 12);
});

test("usage aggregation omits partial, absent, and zero unavailable fields", () => {
	const entries = [
		entry("assistant", "stop", { totalTokens: 123 }, undefined, "gpt"),
		entry("assistant", "length", { cacheRead: 0, cacheWrite: 9 }),
		entry("assistant", "error", { input: 999, totalTokens: 999 }),
		entry("assistant", "aborted", { input: 999, totalTokens: 999 }),
	];
	assert.deepEqual(summarizeSubagentUsage(entries), {
		requests: 2,
		total: 132,
		contextTokens: 123,
		model: "gpt",
		cacheRead: 0,
		cacheWrite: 9,
		skippedInvalidUsage: 0,
	});
});

test("usage aggregation skips malformed usage without dropping requests that have none", () => {
	const entries = [
		entry("assistant", "stop", {
			input: -1,
			output: 2,
			totalTokens: -1,
		}),
		entry("assistant", "stop"),
	];
	assert.deepEqual(summarizeSubagentUsage(entries), {
		requests: 2,
		skippedInvalidUsage: 1,
	});
});

test("usage aggregation keeps assistant identity and omits context when no usage exists", () => {
	const usage = summarizeSubagentUsage([
		entry("user", "stop", { input: 999 }),
		entry("assistant", "stop", undefined, "openai", "gpt"),
	]);
	assert.deepEqual(usage, {
		requests: 1,
		provider: "openai",
		model: "gpt",
		skippedInvalidUsage: 0,
	});
});

test("formatUsageSummary renders every available field including reported zero cache values", () => {
	const summary: SubagentUsageSummary = {
		requests: 3,
		input: 1_234,
		output: 567,
		total: 1_801,
		contextTokens: 9_500,
		contextWindow: 200_000,
		contextRatio: 0.0475,
		provider: "anthropic",
		model: "claude",
		thinking: "high",
		cacheRead: 0,
		cacheWrite: 412,
		skippedInvalidUsage: 0,
	};
	assert.equal(
		formatUsageSummary(summary),
		"Usage: 3 requests · input 1,234 · output 567 · total 1,801 "
			+ "· context 9,500/200k (5%) · cache read 0 · cache write 412 "
			+ "· anthropic/claude · thinking high",
	);
});

test("formatUsageSummary omits unavailable fields and the ratio without a window", () => {
	assert.equal(
		formatUsageSummary({ requests: 2, total: 90, contextTokens: 90, skippedInvalidUsage: 0 }),
		"Usage: 2 requests · total 90 · context 90",
	);
	assert.equal(
		formatUsageSummary({ requests: 1, provider: "openai", skippedInvalidUsage: 0 }),
		"Usage: 1 request · openai",
	);
});

test("formatUsageSummary returns nothing for absent summaries or zero completed requests", () => {
	assert.equal(formatUsageSummary(undefined), undefined);
	assert.equal(formatUsageSummary({ requests: 0, skippedInvalidUsage: 2 }), undefined);
});

test("withContextWindow keeps summaries unchanged for invalid or missing windows", () => {
	const summary: SubagentUsageSummary = {
		requests: 1,
		contextTokens: 100,
		skippedInvalidUsage: 0,
	};
	assert.equal(withContextWindow(summary, undefined), summary);
	assert.equal(withContextWindow(summary, 0), summary);
	assert.equal(withContextWindow(summary, -5), summary);
	assert.equal(withContextWindow(summary, Number.NaN), summary);
	assert.deepEqual(withContextWindow(summary, 1_000_000), {
		...summary,
		contextWindow: 1_000_000,
		contextRatio: 0.0001,
	});
});
