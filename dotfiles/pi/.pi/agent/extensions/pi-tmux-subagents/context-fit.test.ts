import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
} from "./context-fit.ts";
import {
	fingerprintStrings,
	hashText,
	type LaunchProfile,
	updateProfileAfterSuccessfulResponse,
	writeLaunchProfile,
} from "./launch-profile.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-context-fit-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

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
