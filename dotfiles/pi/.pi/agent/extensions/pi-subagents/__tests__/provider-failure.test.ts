import assert from "node:assert/strict";
import test from "node:test";
import { buildProviderFailureRecord, classifyProviderFailure } from "../execution/provider-failure.ts";
import { classifyProviderFailure as classifyForRecovery } from "../workflow/recovery.ts";

test("generic provider failure classification stays identical for recovery and ordinary agents", () => {
	for (const [message, expected] of [
		["429 rate limit", "retry-exhausted"],
		["quota exceeded after timeout", "usage"],
		["unexpected agent error", "other"],
	] as const) {
		assert.equal(classifyProviderFailure(message), expected);
		assert.equal(classifyForRecovery(message), expected);
	}
});

test("provider failure records redact quoted credential keys and escaped string values", () => {
	const record = buildProviderFailureRecord({
		kind: "usage",
		message: JSON.stringify({
			error: "Quota exceeded.",
			api_key: "synthetic value",
			password: 'synthetic "quoted" value',
			access_token: "synthetic\\value\nnext line",
			authorization: "Basic abc",
		}),
	});
	assert.deepEqual(JSON.parse(record.message), {
		error: "Quota exceeded.",
		api_key: "[REDACTED]",
		password: "[REDACTED]",
		access_token: "[REDACTED]",
		authorization: "[REDACTED]",
	});
});
