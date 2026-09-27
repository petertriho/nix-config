import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { estimateTokens, SessionManager } from "@earendil-works/pi-coding-agent";
import { estimateSavedSessionContext } from "../context-estimate.ts";

function withTempSession(run: (sessionPath: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-context-estimate-"));
	try {
		run(join(dir, "session.jsonl"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function jsonl(entries: unknown[]): string {
	return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

const timestamp = "2026-09-27T00:00:00Z";
const userMessage = { role: "user", content: "x".repeat(800), timestamp: 1 } as const;
const header = { type: "session", version: 3, id: "s", timestamp, cwd: process.cwd() };
const userEntry = { type: "message", id: "u1", parentId: null, timestamp, message: userMessage };

for (const fails of [false, true]) {
	test(`estimation preserves a concurrent child append ${fails ? "on failure" : "on success"}`, (t) => {
		withTempSession((sessionPath) => {
			const raw = jsonl([header, userEntry]);
			const appended = jsonl([{
				type: "message",
				id: "u2",
				parentId: "u1",
				timestamp,
				message: { ...userMessage, content: "child progress ".repeat(100) },
			}]);
			writeFileSync(sessionPath, raw);
			const buildContext = SessionManager.prototype.buildSessionContext;
			const failure = new Error("context reconstruction failed");
			const hook = t.mock.method(SessionManager.prototype, "buildSessionContext", function (this: SessionManager) {
				const context = buildContext.call(this);
				// Deterministic interleaving: a separate process appends after the
				// estimator has captured its context, but before it returns/throws.
				execFileSync(process.execPath, [
					"-e",
					'require("node:fs").appendFileSync(process.argv[1], process.argv[2]);',
					sessionPath,
					appended,
				]);
				if (fails) throw failure;
				return context;
			});
			try {
				if (fails) {
					assert.throws(() => estimateSavedSessionContext(sessionPath), (error) => error === failure);
				} else {
					const estimate = estimateSavedSessionContext(sessionPath);
					assert.equal(estimate.tokens, estimateTokens(userMessage));
					assert.equal(estimate.source, "conservative");
				}
				assert.equal(hook.mock.callCount(), 1);
				assert.equal(readFileSync(sessionPath, "utf8"), raw + appended);
			} finally {
				hook.mock.restore();
			}
		});
	});
}

test("legacy linear sessions migrate in memory, including compaction references", (t) => {
	withTempSession((sessionPath) => {
		const raw = jsonl([
			{ ...header, version: 1 },
			{ type: "message", timestamp, message: { ...userMessage, content: "summarized ".repeat(1000) } },
			{ type: "message", timestamp, message: userMessage },
			{ type: "compaction", timestamp, summary: "Earlier work", firstKeptEntryIndex: 2, tokensBefore: 3000 },
		]);
		writeFileSync(sessionPath, raw);
		const before = statSync(sessionPath);
		const buildContext = SessionManager.prototype.buildSessionContext;
		const hook = t.mock.method(SessionManager.prototype, "buildSessionContext", function (this: SessionManager) {
			// No transient migration write is permitted, not even one restored later.
			assert.equal(this.isPersisted(), false);
			assert.equal(readFileSync(sessionPath, "utf8"), raw);
			assert.equal(this.getHeader()?.version, 3);
			const entries = this.getEntries();
			assert.equal(entries[0].parentId, null);
			assert.equal(entries[1].parentId, entries[0].id);
			const compaction = entries[2];
			assert.equal(compaction.type, "compaction");
			if (compaction.type === "compaction") {
				assert.equal(compaction.firstKeptEntryId, entries[1].id);
			}
			const context = buildContext.call(this);
			assert.deepEqual(context.messages.map((message) => message.role), ["compactionSummary", "user"]);
			return context;
		});
		try {
			const expectedTokens = estimateTokens({
				role: "compactionSummary",
				summary: "Earlier work",
				tokensBefore: 3000,
				timestamp: Date.parse(timestamp),
			}) + estimateTokens(userMessage);
			assert.deepEqual(estimateSavedSessionContext(sessionPath), {
				tokens: expectedTokens,
				usageTokens: 0,
				trailingTokens: expectedTokens,
				source: "conservative",
			});
			assert.equal(hook.mock.callCount(), 1);
			assert.equal(readFileSync(sessionPath, "utf8"), raw);
			assert.equal(statSync(sessionPath).mtimeMs, before.mtimeMs);
		} finally {
			hook.mock.restore();
		}
	});
});

test("legacy hook messages migrate in memory and retain their token estimate", (t) => {
	withTempSession((sessionPath) => {
		const message = {
			role: "custom",
			customType: "legacy-context",
			content: "legacy context ".repeat(100),
			display: false,
			timestamp: 1,
		} as const;
		const raw = jsonl([
			{ ...header, version: 2 },
			{ ...userEntry, message: { ...message, role: "hookMessage" } },
		]);
		writeFileSync(sessionPath, raw);
		const before = statSync(sessionPath);
		const buildContext = SessionManager.prototype.buildSessionContext;
		const hook = t.mock.method(SessionManager.prototype, "buildSessionContext", function (this: SessionManager) {
			assert.equal(this.isPersisted(), false);
			assert.equal(readFileSync(sessionPath, "utf8"), raw);
			const context = buildContext.call(this);
			assert.equal(context.messages[0].role, "custom");
			return context;
		});
		try {
			assert.equal(estimateSavedSessionContext(sessionPath).tokens, estimateTokens(message));
			assert.equal(hook.mock.callCount(), 1);
			assert.equal(readFileSync(sessionPath, "utf8"), raw);
			assert.equal(statSync(sessionPath).mtimeMs, before.mtimeMs);
		} finally {
			hook.mock.restore();
		}
	});
});

test("empty and unterminated snapshots do not initialize or repair the live file", () => {
	withTempSession((sessionPath) => {
		for (const raw of ["", jsonl([header, userEntry]).trimEnd(), `${jsonl([header, userEntry])}{"type":`]) {
			writeFileSync(sessionPath, raw);
			// A write-and-restore must be detectable even on coarse filesystem clocks.
			utimesSync(sessionPath, new Date(timestamp), new Date(timestamp));
			const before = statSync(sessionPath);
			const estimate = estimateSavedSessionContext(sessionPath);
			assert.equal(estimate.tokens, raw ? estimateTokens(userMessage) : 0);
			assert.equal(readFileSync(sessionPath, "utf8"), raw);
			assert.equal(statSync(sessionPath).mtimeMs, before.mtimeMs);
		}
	});
});

test("invalid nonempty snapshots still fail closed without changing the file", () => {
	withTempSession((sessionPath) => {
		for (const raw of [" \n", "not json\n", "{}\n", jsonl([userEntry]), jsonl([{ ...header, id: 123 }])]) {
			writeFileSync(sessionPath, raw);
			const before = statSync(sessionPath);
			assert.throws(() => estimateSavedSessionContext(sessionPath), /not a valid .* session/i);
			assert.equal(readFileSync(sessionPath, "utf8"), raw);
			assert.equal(statSync(sessionPath).mtimeMs, before.mtimeMs);
		}
	});
});
