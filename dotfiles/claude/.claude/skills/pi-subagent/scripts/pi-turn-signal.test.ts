import assert from "node:assert/strict";
import test from "node:test";
import { extractAssistantText } from "./pi-turn-signal.ts";

test("extractAssistantText joins only the text blocks of the last assistant message", () => {
	const messages = [
		{ role: "user", content: [{ type: "text", text: "question" }] },
		{ role: "assistant", stopReason: "toolUse", content: [{ type: "text", text: "earlier" }] },
		{ role: "toolResult", content: [{ type: "text", text: "tool output" }] },
		{
			role: "assistant",
			stopReason: "stop",
			content: [
				{ type: "thinking", thinking: "hidden" },
				{ type: "text", text: "first" },
				{ type: "toolCall", id: "t1", name: "read", arguments: {} },
				{ type: "text", text: "second" },
			],
		},
	];

	assert.deepEqual(extractAssistantText(messages), { text: "first\nsecond", stopReason: "stop" });
});

test("extractAssistantText reports an error stop with its error message", () => {
	const messages = [
		{ role: "user", content: [{ type: "text", text: "question" }] },
		{ role: "assistant", stopReason: "error", errorMessage: "overloaded", content: [] },
	];

	assert.deepEqual(extractAssistantText(messages), {
		text: "",
		stopReason: "error",
		errorMessage: "overloaded",
	});
});

test("extractAssistantText returns empty text and stop reason none without an assistant message", () => {
	const empty = { text: "", stopReason: "none" };

	assert.deepEqual(extractAssistantText([{ role: "user", content: [{ type: "text", text: "q" }] }]), empty);
	assert.deepEqual(extractAssistantText([]), empty);
	assert.deepEqual(extractAssistantText(undefined), empty);
});
