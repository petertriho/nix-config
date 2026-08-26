import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendBranchSummary,
	copySessionFile,
	findLastAssistantMessage,
	getLeafId,
	getNewEntries,
	mergeNewEntries,
	seedSubagentSessionFile,
	type SessionEntry,
} from "./session.ts";

const SESSION_HEADER = { type: "session", id: "sess-001", version: 3 };
const MODEL_CHANGE = { type: "model_change", id: "mc-001", parentId: null };
const USER_MSG = {
	type: "message",
	id: "user-001",
	parentId: "mc-001",
	message: { role: "user", content: [{ type: "text", text: "Hello, plan something" }] },
};
const ASSISTANT_MSG = {
	type: "message",
	id: "asst-001",
	parentId: "user-001",
	message: { role: "assistant", content: [{ type: "text", text: "Here is my plan..." }] },
};
const ASSISTANT_MSG_2 = {
	type: "message",
	id: "asst-002",
	parentId: "asst-001",
	message: {
		role: "assistant",
		content: [
			{ type: "thinking", thinking: "Let me think..." },
			{ type: "text", text: "Updated plan with details." },
		],
	},
};
const TOOL_RESULT = {
	type: "message",
	id: "tool-001",
	parentId: "asst-001",
	message: {
		role: "toolResult",
		toolCallId: "tc-001",
		toolName: "bash",
		content: [{ type: "text", text: "output here" }],
	},
};

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-session-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function writeSession(dir: string, name: string, entries: object[]): string {
	const file = join(dir, name);
	writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
	return file;
}

const asEntries = (entries: object[]) => entries as unknown as SessionEntry[];

test("getLeafId returns the last entry id and null for an empty file", () => {
	withTempDir((dir) => {
		const file = writeSession(dir, "a.jsonl", [SESSION_HEADER, MODEL_CHANGE, USER_MSG, ASSISTANT_MSG]);
		assert.equal(getLeafId(file), "asst-001");
		const empty = join(dir, "empty.jsonl");
		writeFileSync(empty, "");
		assert.equal(getLeafId(empty), null);
	});
});

test("getNewEntries returns entries after the given count", () => {
	withTempDir((dir) => {
		const file = writeSession(dir, "a.jsonl", [SESSION_HEADER, MODEL_CHANGE, USER_MSG, ASSISTANT_MSG]);
		const entries = getNewEntries(file, 2);
		assert.deepEqual(entries.map((entry) => entry.id), ["user-001", "asst-001"]);
		const none = writeSession(dir, "b.jsonl", [SESSION_HEADER, MODEL_CHANGE]);
		assert.equal(getNewEntries(none, 2).length, 0);
	});
});

test("findLastAssistantMessage returns the last assistant text and skips thinking and tool results", () => {
	assert.equal(
		findLastAssistantMessage(asEntries([USER_MSG, ASSISTANT_MSG, ASSISTANT_MSG_2])),
		"Updated plan with details.",
	);
	assert.equal(findLastAssistantMessage(asEntries([ASSISTANT_MSG_2])), "Updated plan with details.");
	assert.equal(findLastAssistantMessage(asEntries([ASSISTANT_MSG, TOOL_RESULT])), "Here is my plan...");
	assert.equal(findLastAssistantMessage(asEntries([USER_MSG])), null);
	assert.equal(findLastAssistantMessage([]), null);
});

test("findLastAssistantMessage skips empty assistant messages", () => {
	const real = { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Real summary content." }] } };
	const empty = { type: "message", message: { role: "assistant", content: [] } };
	assert.equal(findLastAssistantMessage(asEntries([real, empty])), "Real summary content.");
});

test("findLastAssistantMessage surfaces errorMessage for stopReason=error without text", () => {
	const earlierGood = {
		type: "message",
		message: { role: "assistant", content: [{ type: "text", text: "Investigating the bug..." }] },
	};
	const overloadError = {
		type: "message",
		message: {
			role: "assistant",
			content: [],
			stopReason: "error",
			errorMessage: "Anthropic 529 Overloaded after 3 retries",
		},
	};
	assert.equal(
		findLastAssistantMessage(asEntries([earlierGood, overloadError])),
		"Subagent error: Anthropic 529 Overloaded after 3 retries",
	);
});

test("findLastAssistantMessage prefers text over the error fallback and never invents one", () => {
	const withText = {
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "Here is partial output." }],
			stopReason: "error",
			errorMessage: "stream interrupted",
		},
	};
	assert.equal(findLastAssistantMessage(asEntries([withText])), "Here is partial output.");
	const noMessage = { type: "message", message: { role: "assistant", content: [], stopReason: "error" } };
	assert.equal(findLastAssistantMessage(asEntries([noMessage])), null);
});

test("appendBranchSummary appends a branch_summary entry with fromId fallback", () => {
	withTempDir((dir) => {
		const file = writeSession(dir, "a.jsonl", [SESSION_HEADER, USER_MSG, ASSISTANT_MSG]);
		const id = appendBranchSummary(file, "user-001", "asst-001", "The plan was created.");
		const lines = readFileSync(file, "utf8").trim().split("\n");
		assert.equal(lines.length, 4);
		const summary = JSON.parse(lines[3]);
		assert.equal(summary.type, "branch_summary");
		assert.equal(summary.id, id);
		assert.equal(summary.parentId, "user-001");
		assert.equal(summary.fromId, "asst-001");
		assert.equal(summary.summary, "The plan was created.");
		assert.ok(summary.timestamp);

		const other = writeSession(dir, "b.jsonl", [SESSION_HEADER]);
		appendBranchSummary(other, "branch-pt", null, "summary");
		assert.equal(JSON.parse(readFileSync(other, "utf8").trim().split("\n")[1]).fromId, "branch-pt");
	});
});

test("copySessionFile creates an identical copy at a new path", () => {
	withTempDir((dir) => {
		const file = writeSession(dir, "a.jsonl", [SESSION_HEADER, USER_MSG]);
		const copyDir = join(dir, "copies");
		mkdirSync(copyDir, { recursive: true });
		const copy = copySessionFile(file, copyDir);
		assert.notEqual(copy, file);
		assert.ok(copy.endsWith(".jsonl"));
		assert.equal(readFileSync(copy, "utf8"), readFileSync(file, "utf8"));
	});
});

test("seedSubagentSessionFile lineage-only writes a header with parent linkage and no turns", () => {
	withTempDir((dir) => {
		const parentFile = writeSession(dir, "parent.jsonl", [SESSION_HEADER, MODEL_CHANGE, USER_MSG, ASSISTANT_MSG]);
		const childFile = join(dir, "nested", "lineage-child.jsonl");
		seedSubagentSessionFile({
			mode: "lineage-only",
			parentSessionFile: parentFile,
			childSessionFile: childFile,
			childCwd: "/tmp/child-cwd",
		});
		const lines = readFileSync(childFile, "utf8").trim().split("\n");
		assert.equal(lines.length, 1);
		const header = JSON.parse(lines[0]);
		assert.equal(header.type, "session");
		assert.equal(header.parentSession, parentFile);
		assert.equal(header.cwd, "/tmp/child-cwd");
	});
});

test("seedSubagentSessionFile fork copies context before the triggering user turn", () => {
	withTempDir((dir) => {
		const parentFile = writeSession(dir, "parent.jsonl", [SESSION_HEADER, MODEL_CHANGE, USER_MSG, ASSISTANT_MSG]);
		const childFile = join(dir, "fork-child.jsonl");
		seedSubagentSessionFile({
			mode: "fork",
			parentSessionFile: parentFile,
			childSessionFile: childFile,
			childCwd: "/tmp/fork-child-cwd",
		});
		const entries = readFileSync(childFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(entries.length, 2);
		assert.equal(entries[0].type, "session");
		assert.equal(entries[0].parentSession, parentFile);
		assert.equal(entries[0].cwd, "/tmp/fork-child-cwd");
		assert.equal(entries[1].type, "model_change");
		assert.equal(entries.some((entry) => entry.type === "message"), false);
	});
});

test("mergeNewEntries appends source entries after the shared base to the target", () => {
	withTempDir((dir) => {
		const sourceFile = writeSession(dir, "source.jsonl", [SESSION_HEADER, USER_MSG, ASSISTANT_MSG]);
		const targetFile = writeSession(dir, "target.jsonl", [SESSION_HEADER, USER_MSG]);
		const merged = mergeNewEntries(sourceFile, targetFile, 2);
		assert.deepEqual(merged.map((entry) => entry.id), ["asst-001"]);
		assert.equal(readFileSync(targetFile, "utf8").trim().split("\n").length, 3);
	});
});
