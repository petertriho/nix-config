import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { estimateTokens, SessionManager } from "@earendil-works/pi-coding-agent";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildRolloverHandoff,
	calculateContextFit,
	chooseResumeGateAction,
	estimateSavedSessionContext,
	linkRolloverLineage,
	RESUME_ROLLOVER_THRESHOLD,
	toContextEstimateRecord,
} from "../sessions/context-fit.ts";
import {
	fingerprintStrings,
	hashText,
	type LaunchProfile,
	updateProfileAfterSuccessfulResponse,
	writeLaunchProfile,
} from "../launch-profile.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-context-fit-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function withTempSession(run: (sessionPath: string) => void): void {
	withTempDir((dir) => {
		run(join(dir, "session.jsonl"));
	});
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

test("context fit gates below, equal to, and above 65 percent", () => {
	assert.equal(calculateContextFit(64_999, 100_000).requiresGate, false);
	assert.equal(calculateContextFit(65_000, 100_000).requiresGate, true);
	assert.equal(calculateContextFit(13, 20).ratio, RESUME_ROLLOVER_THRESHOLD);
	assert.equal(calculateContextFit(13, 20).requiresGate, true);
	assert.equal(calculateContextFit(12, 20).requiresGate, false);
	assert.equal(calculateContextFit(90_000, 100_000).requiresGate, true);
});

test("context fit compares larger and smaller replacement context windows", () => {
	// 90k tokens: safe headroom in a 200k window, gated in a 120k window,
	// over the limit entirely in an 80k window.
	const inLarge = calculateContextFit(90_000, 200_000);
	assert.equal(inLarge.requiresGate, false);
	assert.equal(inLarge.ratio, 0.45);
	const inSmall = calculateContextFit(90_000, 120_000);
	assert.equal(inSmall.requiresGate, true);
	assert.equal(inSmall.ratio, 0.75);
	const overLimit = calculateContextFit(90_000, 80_000);
	assert.equal(overLimit.requiresGate, true);
	assert.ok(overLimit.ratio > 1);
	assert.throws(() => calculateContextFit(-1, 100), /finite non-negative/);
	assert.throws(() => calculateContextFit(10, 0), /finite positive/);
});

test("saved context uses latest assistant usage plus trailing estimates", () => {
	withTempDir((dir) => {
		const session = join(dir, "session.jsonl");
		const entries = [
			{ type: "session", version: 3, id: "s", timestamp: "2026-08-27T00:00:00Z", cwd: dir },
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "2026-08-27T00:00:01Z",
				message: { role: "user", content: "hello", timestamp: 1 },
			},
			{
				type: "message",
				id: "a1",
				parentId: "u1",
				timestamp: "2026-08-27T00:00:02Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "answer" }],
					api: "openai-responses",
					provider: "openai",
					model: "gpt",
					usage: {
						input: 1_000,
						output: 100,
						cacheRead: 200,
						cacheWrite: 0,
						totalTokens: 1_300,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: 2,
				},
			},
			{
				type: "message",
				id: "u2",
				parentId: "a1",
				timestamp: "2026-08-27T00:00:03Z",
				message: { role: "user", content: "x".repeat(400), timestamp: 3 },
			},
		];
		writeFileSync(session, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
		const estimate = estimateSavedSessionContext(session);
		assert.equal(estimate.source, "usage+estimate");
		assert.equal(estimate.usageTokens, 1_300);
		assert.ok(estimate.trailingTokens >= 100);
		assert.equal(estimate.tokens, estimate.usageTokens + estimate.trailingTokens);
	});
});

test("saved context ignores failed and aborted zero-usage turns", () => {
	for (const stopReason of ["error", "aborted"] as const) {
		withTempDir((dir) => {
			const session = join(dir, `${stopReason}.jsonl`);
			const entries = [
				{ type: "session", version: 3, id: "s", timestamp: "2026-08-27T00:00:00Z", cwd: dir },
				{
					type: "message",
					id: "u1",
					parentId: null,
					timestamp: "2026-08-27T00:00:01Z",
					message: { role: "user", content: "do the work", timestamp: 1 },
				},
				{
					type: "message",
					id: "a1",
					parentId: "u1",
					timestamp: "2026-08-27T00:00:02Z",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "partial result" }],
						usage: {
							input: 149_900,
							output: 100,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 150_000,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "stop",
						timestamp: 2,
					},
				},
				{
					type: "message",
					id: "a2",
					parentId: "a1",
					timestamp: "2026-08-27T00:00:03Z",
					message: {
						role: "assistant",
						content: [],
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason,
						errorMessage: stopReason === "error" ? "quota exhausted" : undefined,
						timestamp: 3,
					},
				},
			];
			writeFileSync(session, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);

			const estimate = estimateSavedSessionContext(session);
			assert.equal(estimate.source, "usage+estimate");
			assert.equal(estimate.usageTokens, 150_000);
			assert.ok(estimate.trailingTokens >= 0);
			assert.equal(estimate.tokens, estimate.usageTokens + estimate.trailingTokens);
		});
	}
});

test("saved context falls back to a conservative message estimate without usage", () => {
	withTempDir((dir) => {
		const session = join(dir, "session.jsonl");
		const entries = [
			{ type: "session", version: 3, id: "s", timestamp: "2026-08-27T00:00:00Z", cwd: dir },
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "2026-08-27T00:00:01Z",
				message: { role: "user", content: "x".repeat(800), timestamp: 1 },
			},
		];
		writeFileSync(session, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
		const estimate = estimateSavedSessionContext(session);
		assert.equal(estimate.source, "conservative");
		assert.equal(estimate.usageTokens, 0);
		assert.ok(estimate.tokens >= 200);
	});
});

test("estimation never mutates the saved session", () => {
	withTempDir((dir) => {
		// Valid session: byte-identical after estimation.
		const session = join(dir, "valid.jsonl");
		const entries = [
			{ type: "session", version: 3, id: "s", timestamp: "2026-08-27T00:00:00Z", cwd: dir },
			{
				type: "message",
				id: "a1",
				parentId: null,
				timestamp: "2026-08-27T00:00:02Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "answer" }],
					usage: {
						input: 500,
						output: 50,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 550,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: 2,
				},
			},
		];
		const raw = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
		writeFileSync(session, raw);
		const before = statSync(session);
		estimateSavedSessionContext(session);
		assert.equal(readFileSync(session, "utf8"), raw);
		assert.equal(statSync(session).mtimeMs, before.mtimeMs);

		// Empty file: pi would initialize a header while opening; estimation
		// must restore the original empty content instead.
		const empty = join(dir, "empty.jsonl");
		writeFileSync(empty, "");
		const emptyEstimate = estimateSavedSessionContext(empty);
		assert.equal(emptyEstimate.tokens, 0);
		assert.equal(emptyEstimate.source, "conservative");
		assert.equal(readFileSync(empty, "utf8"), "");
	});
});

test("estimation fails closed for files pi cannot open as sessions", () => {
	withTempDir((dir) => {
		const notASession = join(dir, "garbage.jsonl");
		writeFileSync(notASession, "{}\n");
		assert.throws(() => estimateSavedSessionContext(notASession), /not a valid .* session/i);
		assert.equal(readFileSync(notASession, "utf8"), "{}\n");
	});
});

test("toContextEstimateRecord persists the decision and survives profile updates", () => {
	withTempDir((dir) => {
		const fit = calculateContextFit(150_000, 200_000);
		const record = toContextEstimateRecord(fit);
		assert.equal(record.tokens, 150_000);
		assert.equal(record.contextWindow, 200_000);
		assert.equal(record.ratio, 0.75);
		assert.ok(!Number.isNaN(Date.parse(record.estimatedAt)));

		const session = join(dir, "lineage-target.jsonl");
		writeFileSync(session, "{}\n");
		const profile: LaunchProfile = {
			version: 1,
			stable: {
				displayName: "Worker",
				roleBody: "role",
				roleBodyHash: hashText("role"),
				systemPromptMode: "append",
				cwd: dir,
				agentDir: dir,
				controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
				originalSessionPath: session,
				createdAt: "2026-08-27T00:00:00Z",
			},
			runtime: { resumeCount: 0 },
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T00:00:00Z",
			},
		};
		writeLaunchProfile(session, profile);
		const updated = updateProfileAfterSuccessfulResponse(profile, {
			selection: { provider: "anthropic", model: "claude", thinking: "high" },
			resources: profile.resources,
			contextEstimate: record,
		});
		assert.deepEqual(updated.runtime.lastContextEstimate, record);
		assert.equal(updated.runtime.resumeCount, 1);
	});
});

test("rollover lineage persists in both sidecars and keeps prior links", () => {
	withTempDir((dir) => {
		const mkProfile = (session: string): LaunchProfile => ({
			version: 1,
			stable: {
				displayName: "Worker",
				roleBody: "role",
				roleBodyHash: hashText("role"),
				systemPromptMode: "message",
				cwd: dir,
				agentDir: dir,
				controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
				originalSessionPath: session,
				createdAt: "2026-08-27T00:00:00Z",
			},
			runtime: { resumeCount: 0 },
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T00:00:00Z",
			},
		});

		const oldSession = join(dir, "old.jsonl");
		const newSession = join(dir, "new.jsonl");
		writeFileSync(oldSession, "{}\n");
		writeFileSync(newSession, "{}\n");
		writeLaunchProfile(oldSession, mkProfile(oldSession));
		writeLaunchProfile(newSession, {
			...mkProfile(newSession),
			lineage: { rolledOverTo: "/tmp/some-later-session.jsonl" },
		});

		const warnings = linkRolloverLineage(oldSession, newSession);
		assert.deepEqual(warnings, []);

		const oldProfile = JSON.parse(readFileSync(`${oldSession}.subagent.json`, "utf8"));
		const newProfile = JSON.parse(readFileSync(`${newSession}.subagent.json`, "utf8"));
		assert.equal(oldProfile.lineage.rolledOverTo, newSession);
		assert.equal(newProfile.lineage.rolledOverFrom, oldSession);
		// Untouched lineage fields survive the link instead of being dropped.
		assert.equal(newProfile.lineage.rolledOverTo, "/tmp/some-later-session.jsonl");
		assert.equal(oldProfile.lineage.rolledOverFrom, undefined);

		// Missing sidecars degrade to warnings instead of throwing.
		const orphan = join(dir, "orphan.jsonl");
		writeFileSync(orphan, "{}\n");
		const missing = linkRolloverLineage(orphan, join(dir, "absent.jsonl"));
		assert.equal(missing.length, 2);
		assert.match(missing.join("; "), /Could not update/);
	});
});

test("resume gate returns every user choice and rejects non-interactive pressure", async () => {
	const fit = calculateContextFit(70_000, 100_000);
	for (const [label, expected] of [
		["Start a fresh same-role session (recommended)", "fresh"],
		["Resume the saved session anyway", "resume"],
		["Choose another model", "choose"],
		["Stop", "stop"],
		[undefined, "stop"],
	] as const) {
		const ctx = {
			hasUI: true,
			ui: { select: async () => label },
		} as any;
		assert.equal(await chooseResumeGateAction(ctx, fit), expected);
	}
	await assert.rejects(
		() => chooseResumeGateAction({ hasUI: false, ui: {} } as any, fit),
		/Interactive UI is required/,
	);
	assert.equal(
		await chooseResumeGateAction({ hasUI: false, ui: {} } as any, calculateContextFit(10, 100)),
		"resume",
	);
});

function workflowProfile(): LaunchProfile {
	const sessionPath = "/tmp/old.jsonl";
	return {
		version: 1,
		stable: {
			agentName: "author",
			displayName: "Author",
			roleBody: "role",
			roleBodyHash: hashText("role"),
			systemPromptMode: "append",
			cwd: "/tmp/project",
			agentDir: "/tmp/agent",
			controls: {
				denyTools: [],
				interactive: false,
				sessionMode: "standalone",
			},
			originalSessionPath: sessionPath,
			createdAt: "2026-08-27T00:00:00Z",
		},
		runtime: { resumeCount: 0 },
		resources: {
			tools: fingerprintStrings([]),
			visibleSkills: fingerprintStrings([]),
			updatedAt: "2026-08-27T00:00:00Z",
		},
		workflow: {
			version: 1,
			workflowId: "docs-review",
			runId: "run-docs",
			roleId: "author",
			manifestHash: hashText("manifest"),
			skillHash: hashText("skill"),
			policy: "parent-per-role",
			assignmentSource: "parent",
			projectRoot: "/tmp/project",
			data: {
				draft: "/tmp/project/.artifacts/demo/DRAFT.md",
				secret: "must-not-leak-without-manifest-reads",
			},
		},
	};
}

test("public rollover fallback stays generic and does not infer manifest-readable workflow data", () => {
	const handoff = buildRolloverHandoff(workflowProfile(), "Continue now.");
	assert.match(handoff, /fresh same-role rollover/);
	assert.match(handoff, /dedicated lifecycle tool/);
	assert.match(handoff, /Continue now\./);
	assert.doesNotMatch(handoff, /DRAFT\.md|must-not-leak/);
});
