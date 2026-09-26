import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderFailure } from "../failure.ts";
import { classifyProviderFailure as classifyForRecovery } from "../../pi-workflows/workflow/recovery.ts";

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
