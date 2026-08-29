import assert from "node:assert/strict";
import test from "node:test";
import {
	RECOVERY_SELECT_MODEL,
	RECOVERY_STOP,
	WORKFLOW_PHASE_LABELS,
	buildProviderFailureRecord,
	classifyProviderFailure,
	defaultRecoveryMessage,
	formatFailureKind,
	formatModelSelection,
	formatRecoverySummary,
	shouldOpenRecoveryGate,
} from "./workflow-recovery.ts";

test("quota and usage failures classify as usage exhaustion", () => {
	for (const message of [
		"You exceeded your current quota, please check your plan and billing details",
		"insufficient_quota: Usage limit reached for this API key",
		"billing hard limit reached",
		"monthly usage limit exceeded on your current plan",
		"credit balance too low to complete the request",
		"Rate limit of requests reached: your prepaid credits are exhausted",
		"spending limit reached for this workspace",
	]) {
		assert.equal(classifyProviderFailure(message), "usage", message);
	}
});

test("transient network and overload failures classify as exhausted retries", () => {
	for (const message of [
		"Anthropic 529 Overloaded after 3 retries",
		"Connection error while sending request: socket hang up",
		"request timed out after 60000ms",
		"529 {\"error\":\"overloaded_error\"}",
		"503 Service Unavailable",
		"network temporarily unavailable, try again later",
		"rate limit exceeded (429)",
		"ECONNRESET while streaming",
	]) {
		assert.equal(classifyProviderFailure(message), "retry-exhausted", message);
	}
});

test("retry-exhaustion wording classifies as retry-exhausted and unknown failures as other", () => {
	assert.equal(classifyProviderFailure("Request failed after retries were exhausted"), "retry-exhausted");
	assert.equal(classifyProviderFailure("gave up retrying the request"), "retry-exhausted");
	assert.equal(classifyProviderFailure("invalid x-api-key"), "other");
	assert.equal(classifyProviderFailure("model decommissioned: use a newer model"), "other");
	assert.equal(classifyProviderFailure(""), "other");
	assert.equal(classifyProviderFailure("   "), "other");
});

test("usage markers win over transient wording", () => {
	assert.equal(
		classifyProviderFailure("rate limit hit because the monthly quota is exhausted"),
		"usage",
	);
	assert.equal(
		classifyProviderFailure("overloaded while checking your billing limit"),
		"usage",
	);
});

test("only usage and retry-exhausted open the recovery gate", () => {
	assert.equal(shouldOpenRecoveryGate("usage"), true);
	assert.equal(shouldOpenRecoveryGate("retry-exhausted"), true);
	assert.equal(shouldOpenRecoveryGate("other"), false);
});

test("failure kind labels name all four outcomes distinctly", () => {
	assert.equal(formatFailureKind("usage"), "quota/usage exhaustion");
	assert.equal(formatFailureKind("retry-exhausted"), "transient failures exhausted normal retries");
	assert.equal(formatFailureKind("other"), "provider/agent error");
	for (const phase of ["planner", "task-writer", "implementer", "reviewer"] as const) {
		assert.ok(WORKFLOW_PHASE_LABELS[phase].length > 0);
	}
});

test("provider failure records persist only diagnostics-safe fields", () => {
	const record = buildProviderFailureRecord({
		kind: "usage",
		message: "You exceeded your current quota",
		provider: "test-provider",
		model: "echo",
		recordedAt: new Date("2026-08-29T12:00:00Z"),
	});
	assert.deepEqual(record, {
		kind: "usage",
		message: "You exceeded your current quota",
		provider: "test-provider",
		model: "echo",
		recordedAt: "2026-08-29T12:00:00.000Z",
	});

	const minimal = buildProviderFailureRecord({
		kind: "other",
		message: "boom",
		recordedAt: new Date("2026-08-29T12:00:00Z"),
	});
	assert.deepEqual(minimal, {
		kind: "other",
		message: "boom",
		recordedAt: "2026-08-29T12:00:00.000Z",
	});
});

test("recovery summaries show phase, provider, model, session, estimate, and failure", () => {
	const summary = formatRecoverySummary({
		phase: "implementer",
		failureKind: "usage",
		failure: "You exceeded your current quota",
		sessionPath: "/tmp/project/sessions/impl.jsonl",
		provider: "test-provider",
		model: "echo",
		estimate: { tokens: 150_000, usageTokens: 149_950, trailingTokens: 50, source: "usage+estimate" },
	});
	assert.match(summary, /implementer/);
	assert.match(summary, /quota\/usage exhaustion/);
	assert.match(summary, /Provider\/model: test-provider\/echo/);
	assert.match(summary, /Saved session: \/tmp\/project\/sessions\/impl\.jsonl/);
	assert.match(summary, /Context estimate: 150,000 tokens \(usage\+estimate\)/);
	assert.match(summary, /Failure: You exceeded your current quota/);
	assert.match(summary, /preserved/);

	const withoutEstimate = formatRecoverySummary({
		phase: "reviewer",
		failureKind: "retry-exhausted",
		failure: "529 overloaded",
		sessionPath: "/tmp/r.jsonl",
	});
	assert.match(withoutEstimate, /Context estimate: unavailable/);
	assert.match(withoutEstimate, /Provider\/model: unknown/);
});

test("model selections format with and without thinking", () => {
	assert.equal(formatModelSelection({ provider: "a", model: "b", thinking: "high" }), "a/b:high");
	assert.equal(formatModelSelection({ provider: "a", model: "b" }), "a/b");
	assert.equal(formatModelSelection(undefined), "unknown");
});

test("recovery gate choices and the default recovery message are stable", () => {
	assert.equal(RECOVERY_SELECT_MODEL, "Select a replacement model and thinking level");
	assert.equal(RECOVERY_STOP, "Stop recovery");
	assert.notEqual(RECOVERY_SELECT_MODEL, RECOVERY_STOP);
	assert.match(defaultRecoveryMessage(), /Do not redo completed work/);
});
