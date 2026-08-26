import assert from "node:assert/strict";
import test from "node:test";
import {
	findLatestAssistantError,
	parseDeniedTools,
	shouldAutoExitOnAgentEnd,
	shouldMarkUserTookOver,
} from "./subagent-done.ts";

test("shouldMarkUserTookOver ignores input before the first agent run", () => {
	assert.equal(shouldMarkUserTookOver(false), false);
	assert.equal(shouldMarkUserTookOver(true), true);
});

test("shouldAutoExitOnAgentEnd exits after normal completion regardless of takeover", () => {
	const messages = [{ role: "assistant", stopReason: "stop" }];
	assert.equal(shouldAutoExitOnAgentEnd(false, messages), true);
	assert.equal(shouldAutoExitOnAgentEnd(true, messages), true);
});

test("shouldAutoExitOnAgentEnd stays open after an aborted run", () => {
	assert.equal(shouldAutoExitOnAgentEnd(false, [{ role: "assistant", stopReason: "aborted" }]), false);
});

test("shouldAutoExitOnAgentEnd exits on stopReason=error and with no messages", () => {
	assert.equal(
		shouldAutoExitOnAgentEnd(false, [{ role: "assistant", stopReason: "error", errorMessage: "529 overloaded" }]),
		true,
	);
	assert.equal(shouldAutoExitOnAgentEnd(false, undefined), true);
});

test("findLatestAssistantError returns the error info from the latest assistant message", () => {
	const messages = [
		{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "ok" }] },
		{ role: "toolResult", content: [] },
		{ role: "assistant", stopReason: "error", errorMessage: "Anthropic 529 Overloaded" },
	];
	assert.deepEqual(findLatestAssistantError(messages), {
		errorMessage: "Anthropic 529 Overloaded",
		stopReason: "error",
	});
});

test("findLatestAssistantError returns null for normal or aborted latest turns", () => {
	assert.equal(
		findLatestAssistantError([
			{ role: "assistant", stopReason: "error", errorMessage: "old failure" },
			{ role: "user", content: [] },
			{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] },
		]),
		null,
	);
	assert.equal(findLatestAssistantError([{ role: "assistant", stopReason: "aborted" }]), null);
	assert.equal(findLatestAssistantError(undefined), null);
	assert.equal(findLatestAssistantError([]), null);
});

test("findLatestAssistantError falls back to a placeholder message", () => {
	const info = findLatestAssistantError([{ role: "assistant", stopReason: "error" }]);
	assert.ok(info);
	assert.equal(info.stopReason, "error");
	assert.match(info.errorMessage, /stopReason=error/);
});

test("parseDeniedTools splits, trims, and drops empty entries", () => {
	assert.deepEqual(parseDeniedTools("subagent, subagent_resume ,,"), ["subagent", "subagent_resume"]);
	assert.deepEqual(parseDeniedTools(undefined), []);
	assert.deepEqual(parseDeniedTools(""), []);
});
