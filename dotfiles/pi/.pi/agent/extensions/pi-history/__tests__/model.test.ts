import assert from "node:assert/strict";
import test from "node:test";
import {
	DEFAULT_STASH_ENTER_ACTION,
	extractPromptText,
	extractUserPrompt,
	findVimMode,
	HISTORY_RESULT_LIMIT,
	HISTORY_SHORTCUT,
	INCLUDE_SLASH_COMMANDS,
	PICKER_VISIBLE_ROWS,
	type PromptItem,
	promptMatchIndexes,
	promptPreview,
	REFRESH_THROTTLE_MS,
	STASH_SHORTCUT,
	sanitizePlainTerminalText,
	searchPrompts,
} from "../model.ts";

function history(
	id: string,
	text: string,
	timestamp: number,
	sessionName?: string,
): PromptItem {
	return {
		kind: "history",
		id,
		text,
		timestamp,
		cwd: "/repo",
		sessionPath: `/sessions/${id}.jsonl`,
		sessionName,
	};
}

function hasTerminalControl(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.codePointAt(0) ?? -1;
		return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
	});
}

test("fixed behavior constants match the extension contract", () => {
	assert.equal(STASH_SHORTCUT, "ctrl+s");
	assert.equal(HISTORY_SHORTCUT, "ctrl+r");
	assert.equal(INCLUDE_SLASH_COMMANDS, true);
	assert.equal(HISTORY_RESULT_LIMIT, 120);
	assert.equal(PICKER_VISIBLE_ROWS, 10);
	assert.equal(DEFAULT_STASH_ENTER_ACTION, "pop");
	assert.equal(REFRESH_THROTTLE_MS, 30_000);
});

test("prompt previews stay compact and single-line", () => {
	assert.equal(
		promptPreview("  first\n\tsecond   third  "),
		"first second third",
	);
	assert.equal(promptPreview("abcdef", 5), "abcd…");
});

test("display text strips terminal sequences and control characters", () => {
	const value =
		"before\u001b[2J after\u001b]52;c;SGVsbG8=\u0007 bell\u0007 c1\u009b31mred\u009c\nnext";
	const sanitized = sanitizePlainTerminalText(value);

	assert.equal(sanitized.includes("\u001b"), false);
	assert.equal(sanitized.includes("\u0007"), false);
	assert.equal(hasTerminalControl(sanitized), false);
	assert.match(sanitized, /before after bell c1 31mred next/);
	assert.equal(promptPreview(value), sanitized);
});

test("search ranks exact phrases, substrings, then fuzzy matches", () => {
	const items = [
		history("fuzzy", "Configure user session output retries", 30),
		history("substring", "Fix the cursor in the editor", 20),
		history("exact", "cursor", 10),
	];
	assert.deepEqual(
		searchPrompts(items, "cursor").map((item) => item.id),
		["exact", "substring", "fuzzy"],
	);
});

test("search includes session names and breaks equal relevance by recency", () => {
	const items = [
		history("older", "Investigate regression", 10, "Cursor work"),
		history("newer", "Investigate regression", 20, "Cursor work"),
		history("unmatched", "Other prompt", 30, "Docs"),
	];
	assert.deepEqual(
		searchPrompts(items, "cursor").map((item) => item.id),
		["newer", "older"],
	);
});

test("search applies the fixed result limit by default", () => {
	const items = Array.from({ length: 140 }, (_, index) =>
		history(String(index), `prompt ${index}`, index),
	);
	assert.equal(searchPrompts(items, "").length, HISTORY_RESULT_LIMIT);
	assert.equal(PICKER_VISIBLE_ROWS, 10);
});

test("match indexes highlight exact query tokens case-insensitively", () => {
	assert.deepEqual(
		[...promptMatchIndexes("Fix EDIT then edit again", "edit fix")],
		[0, 1, 2, 4, 5, 6, 7, 14, 15, 16, 17],
	);
	assert.deepEqual([...promptMatchIndexes("cursor", "csr")], []);
});

test("text extraction supports strings, text blocks, slash commands, and images", () => {
	assert.equal(extractPromptText("  /history  "), "/history");
	assert.equal(
		extractPromptText([
			{ type: "text", text: " first " },
			{ type: "image", data: "ignored" },
			{ type: "text", text: "second" },
		]),
		"first\nsecond",
	);

	const item = extractUserPrompt(
		{
			type: "message",
			id: "entry-1",
			timestamp: "2026-01-02T03:04:05.000Z",
			message: {
				role: "user",
				timestamp: 1234,
				content: [
					{ type: "text", text: "/history" },
					{ type: "image", mimeType: "image/png", data: "..." },
				],
			},
		},
		{
			cwd: "/repo",
			sessionPath: "/sessions/current.jsonl",
			sessionName: "Named",
			fallbackTimestamp: 99,
		},
	);
	assert.deepEqual(item, {
		kind: "history",
		id: "entry-1",
		text: "/history",
		timestamp: 1234,
		cwd: "/repo",
		sessionPath: "/sessions/current.jsonl",
		sessionName: "Named",
		hasImages: true,
	});
});

test("timestamp extraction falls back safely and malformed entries are ignored", () => {
	const timestamp = Date.parse("2025-03-04T05:06:07.000Z");
	assert.equal(
		extractUserPrompt(
			{
				type: "message",
				id: "entry-2",
				timestamp: "2025-03-04T05:06:07.000Z",
				message: { role: "user", content: "hello" },
			},
			{ cwd: "/repo", sessionPath: "/session", fallbackTimestamp: 7 },
		)?.timestamp,
		timestamp,
	);
	assert.equal(
		extractUserPrompt(
			{
				type: "message",
				id: "entry-3",
				timestamp: "invalid",
				message: { role: "user", timestamp: Number.NaN, content: "hello" },
			},
			{ cwd: "/repo", sessionPath: "/session", fallbackTimestamp: 7 },
		)?.timestamp,
		7,
	);

	for (const entry of [
		null,
		{},
		{ type: "message", id: "assistant", message: { role: "assistant" } },
		{ type: "message", id: "empty", message: { role: "user", content: [] } },
		{ type: "custom", id: "custom", data: {} },
	]) {
		assert.equal(
			extractUserPrompt(entry, {
				cwd: "/repo",
				sessionPath: "/session",
				fallbackTimestamp: 7,
			}),
			undefined,
		);
	}
});

test("Vim mode detection walks wrapped editors and stops on cycles", () => {
	const leaf = { vimState: { mode: "replace" } };
	const wrapped = { inner: { inner: leaf } };
	assert.equal(findVimMode(wrapped), "replace");
	assert.equal(findVimMode({}), undefined);

	const cyclic: { inner?: unknown } = {};
	cyclic.inner = cyclic;
	assert.equal(findVimMode(cyclic), undefined);
});
