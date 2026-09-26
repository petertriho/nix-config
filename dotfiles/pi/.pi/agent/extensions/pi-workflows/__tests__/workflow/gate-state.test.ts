import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { getPendingWorkflowGate, type WorkflowGateAttempt } from "../../workflow/plannotator.ts";
import { loadWorkflowDefinitionFromPackage } from "../../workflow/schema.ts";
import {
	WORKFLOW_RUN_ENTRY_CUSTOM_TYPE,
	abortWorkflowRun,
	assertNoPendingWorkflowGate,
	completeWorkflowRun,
	createWorkflowRunState,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	mergeWorkflowRunData,
	persistWorkflowRunSnapshots,
	recordWorkflowGateAttempt,
	recordWorkflowRunRoleSession,
	restoreWorkflowRunStateFromBranch,
	restoreWorkflowRunStateFromSession,
	setWorkflowRunActiveLaunch,
	startWorkflowRun,
	summarizeWorkflowRun,
	type StartWorkflowRunInput,
	type WorkflowRunPersistTarget,
	type WorkflowRunTransitionResult,
} from "../../workflow/state.ts";
import type { WorkflowDataValueMap } from "../../workflow/types.ts";

function at(seconds: number): Date {
	return new Date(Date.UTC(2026, 8, 20, 1, 0, seconds));
}

function entry(data: unknown, index = 0): SessionEntry {
	return {
		type: "custom",
		customType: WORKFLOW_RUN_ENTRY_CUSTOM_TYPE,
		id: `snapshot-${index}`,
		parentId: index === 0 ? null : `snapshot-${index - 1}`,
		timestamp: at(index).toISOString(),
		// Exercise the actual JSON storage boundary, not only shared objects.
		data: JSON.parse(JSON.stringify(data)),
	};
}

function fixture(root: string) {
	const packagePath = join(root, "folio");
	mkdirSync(packagePath);
	writeFileSync(join(packagePath, "workflow.json"), JSON.stringify({
		version: 1,
		id: "folio",
		command: { name: "folio", description: "Author and verify a document" },
		skill: "SKILL.md",
		data: {
			draft: { kind: "file", label: "Draft", constraint: { under: ".notes", basename: "DRAFT.md" } },
			check: { kind: "file", label: "Check", constraint: { under: ".notes", basename: "CHECK.md" } },
			ticket: { kind: "string", label: "Ticket" },
		},
		roles: [
			{
				id: "author", label: "Author", agent: "scribe", reads: ["ticket", "draft"],
				writes: ["file:draft"], handoff: "Continue from the current draft.",
			},
			{
				id: "verifier", label: "Verifier", agent: "checker", reads: ["draft", "check"],
				writes: ["file:check"], handoff: "Check the document independently.",
			},
		],
	}));
	writeFileSync(join(packagePath, "SKILL.md"), "---\nname: folio-private\ndescription: Private document workflow\n---\n\nUse workflow lifecycle tools.");
	const loaded = loadWorkflowDefinitionFromPackage(packagePath);
	assert.equal(loaded.status, "ok");
	const draft = join(root, ".notes", "document with spaces", "DRAFT.md");
	const check = join(dirname(draft), "CHECK.md");
	mkdirSync(dirname(draft), { recursive: true });
	writeFileSync(draft, "# Draft\n");
	writeFileSync(check, "# Check\n");
	const input: StartWorkflowRunInput = {
		runId: "folio-run", definition: loaded.definition, source: "project", projectRoot: root,
		policy: "parent-per-role", assignmentSource: "parent",
		data: { draft, check, ticket: "DOC-42" },
	};
	let state = createWorkflowRunState();
	const branch: SessionEntry[] = [];
	const target: WorkflowRunPersistTarget = {
		appendEntry(customType, data) {
			assert.equal(customType, WORKFLOW_RUN_ENTRY_CUSTOM_TYPE);
			branch.push(entry(data, branch.length));
		},
	};
	function commit(transition: WorkflowRunTransitionResult) {
		state = transition.state;
		persistWorkflowRunSnapshots(target, transition.snapshots);
		return transition;
	}
	commit(startWorkflowRun(state, input, { now: () => at(0) }));
	function attempt(id = "gate-1", seconds = 1): WorkflowGateAttempt {
		return {
			id, runId: input.runId, sessionId: "parent-session", gate: "draft-check", artifact: "draft",
			target: draft, reviewDirectory: false,
			resultPath: join(`${dirname(draft)}-decisions`, `draft-check-${id}.json`),
			startedAt: at(seconds).toISOString(), updatedAt: at(seconds).toISOString(), status: "starting",
		};
	}
	function record(attempt: WorkflowGateAttempt, data?: WorkflowDataValueMap) {
		return commit(recordWorkflowGateAttempt(state, attempt, data));
	}
	return {
		input, draft, check, branch, commit, attempt, record,
		get state() { return state; },
		get snapshot() { return getWorkflowRunSnapshot(state, input.runId)!; },
	};
}

type Fixture = ReturnType<typeof fixture>;

function withFixture(body: (f: Fixture, root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-gate-state-"));
	try { body(fixture(root), root); }
	finally { rmSync(root, { recursive: true, force: true }); }
}

function completed(
	attempt: WorkflowGateAttempt,
	feedback = " \n\tKeep these notes exactly.\r\n  ",
	seconds = 3,
): WorkflowGateAttempt {
	return {
		...attempt, status: "completed", decision: "approved", feedback, exitCode: 0, signal: null,
		updatedAt: at(seconds).toISOString(), finishedAt: at(seconds).toISOString(),
	};
}

function priorDecision(f: Fixture): WorkflowGateAttempt {
	const first = f.attempt();
	f.record(first);
	const final = completed(first);
	f.record(final);
	return final;
}

function assertUnchanged(f: Fixture, action: () => unknown, message: RegExp): void {
	const before = JSON.stringify(f.state);
	const entries = f.branch.length;
	assert.throws(action, message);
	assert.equal(JSON.stringify(f.state), before, "rejection must not mutate workflow state");
	assert.equal(f.branch.length, entries, "rejection must not append a snapshot");
}

test("version-one snapshots without gateHistory still load and permit role launches", () => {
	withFixture((f, root) => {
		const historical = JSON.parse(JSON.stringify(f.snapshot));
		delete historical.gateHistory;
		assert.equal(historical.version, 1);
		const restored = restoreWorkflowRunStateFromSession({ getBranch: () => [entry(historical)] });
		const run = getActiveWorkflowRun(restored.state)!;
		assert.ok(run);
		assert.equal(run.workflowId, "folio");
		assert.equal(run.gateHistory, undefined);
		assert.deepEqual(restored.snapshots, []);
		assert.doesNotThrow(() => assertNoPendingWorkflowGate(run));
		assert.equal(setWorkflowRunActiveLaunch(restored.state, run.runId, {
			roleId: "author", status: "starting", sessionPath: join(root, "author.jsonl"),
		}).snapshots.length, 1);
	});
});

for (const decision of ["approved", "annotated", "dismissed"] as const) {
	test(`${decision} feedback survives immutable state, persistence, and restore without trimming`, () => {
		withFixture((f) => {
			const pending = f.attempt();
			f.record(pending);
			const feedback = ` \n\t${decision}: ☃\r\n\n  /absolute/file:\n    keep all spaces  \n `;
			const final = { ...completed(pending, feedback), decision };
			f.record(final);
			assert.equal(f.snapshot.gateHistory![0]!.feedback, feedback);
			assert.equal(Object.isFrozen(f.snapshot.gateHistory), true);
			assert.equal(Object.isFrozen(f.snapshot.gateHistory![0]), true);
			final.feedback = "mutated caller object";
			assert.equal(f.snapshot.gateHistory![0]!.feedback, feedback);
			const restored = restoreWorkflowRunStateFromBranch(f.branch, { now: () => at(10) });
			const run = getActiveWorkflowRun(restored.state)!;
			assert.deepEqual(restored.snapshots, []);
			assert.equal(run.gateHistory![0]!.feedback, feedback);
			assert.equal(run.gateHistory![0]!.decision, decision);
			assert.equal(run.gateHistory![0]!.resultPath, pending.resultPath);
			assert.equal(run.updatedAt, at(3).toISOString());
		});
	});
}

test("empty and large feedback are retained without being confused with missing feedback", () => {
	withFixture((f) => {
		const empty = f.attempt();
		f.record(empty);
		f.record(completed(empty, ""));
		const large = f.attempt("gate-2", 4);
		f.record(large);
		const feedback = ` \n${"raw notes ☃\r\n".repeat(20_000)}\t `;
		f.record(completed(large, feedback, 5));
		const restored = restoreWorkflowRunStateFromBranch(f.branch);
		const history = getActiveWorkflowRun(restored.state)!.gateHistory!;
		assert.equal(history[0]!.feedback, "");
		assert.equal(Object.hasOwn(history[0]!, "feedback"), true);
		assert.equal(history[1]!.feedback, feedback);
	});
});

for (const status of ["starting", "running"] as const) {
	test(`${status} gates restore as interrupted without requiring any activeLaunch`, () => {
		withFixture((f) => {
			const first = priorDecision(f);
			const pending = f.attempt("gate-2", 4);
			f.record(pending);
			if (status === "running") f.record({ ...pending, status, updatedAt: at(5).toISOString() });
			assert.equal(f.snapshot.activeLaunch, undefined);
			const restored = restoreWorkflowRunStateFromBranch(f.branch, { now: () => at(10) });
			const run = getActiveWorkflowRun(restored.state)!;
			assert.equal(restored.snapshots.length, 1);
			assert.equal(run.status, "active");
			assert.equal(run.activeLaunch, undefined);
			assert.deepEqual(run.gateHistory![0], first);
			assert.equal(run.gateHistory![1]!.status, "interrupted");
			assert.equal(run.gateHistory![1]!.finishedAt, at(10).toISOString());
			assert.equal(run.gateHistory![1]!.updatedAt, at(10).toISOString());
			assert.match(run.gateHistory![1]!.failureReason!, /chat fallback/);
			assert.equal(run.updatedAt, at(10).toISOString());
			assert.equal(summarizeWorkflowRun(run).interrupted, true);
			assert.equal(summarizeWorkflowRun(run).latestGate?.id, pending.id);
			assert.equal(summarizeWorkflowRun(run).latestGate?.interrupted, true);
			assert.equal(getPendingWorkflowGate(run), undefined);
			assert.equal(f.snapshot.gateHistory![1]!.status, status, "restore must not mutate its input state");
			const replay = restoreWorkflowRunStateFromBranch([
				...f.branch, entry(restored.snapshots[0], f.branch.length),
			], { now: () => at(11) });
			assert.deepEqual(replay.snapshots, [], "restoring an interruption twice must be idempotent");
			assert.deepEqual(getActiveWorkflowRun(replay.state)!.gateHistory, run.gateHistory);
		});
	});
}

test("gate-only restore leaves a previously completed role launch and saved session intact", () => {
	withFixture((f, root) => {
		const session = join(root, "author.jsonl");
		f.commit(recordWorkflowRunRoleSession(f.state, f.input.runId, "author", session, {
			launchStatus: "completed", now: () => at(0),
		}));
		f.record(f.attempt());
		const restored = restoreWorkflowRunStateFromBranch(f.branch, { now: () => at(10) });
		const run = getActiveWorkflowRun(restored.state)!;
		assert.equal(run.activeLaunch?.status, "completed");
		assert.equal(run.roleSessions.author?.current, session);
		assert.equal(run.gateHistory![0]!.status, "interrupted");
	});
});

for (const status of ["starting", "running"] as const) {
	test(`abort preserves prior decisions and interrupts a ${status} gate`, () => {
		withFixture((f) => {
			const first = priorDecision(f);
			const pending = f.attempt("gate-2", 4);
			f.record(pending);
			if (status === "running") f.record({ ...pending, status, updatedAt: at(5).toISOString() });
			f.commit(abortWorkflowRun(f.state, f.input.runId, { now: () => at(10) }));
			assert.equal(getActiveWorkflowRun(f.state), null);
			assert.equal(f.snapshot.status, "aborted");
			assert.deepEqual(f.snapshot.gateHistory![0], first);
			assert.equal(f.snapshot.gateHistory![1]!.status, "interrupted");
			assert.equal(f.snapshot.gateHistory![1]!.resultPath, pending.resultPath);
			assert.equal(f.snapshot.gateHistory![1]!.target, pending.target);
			assert.equal(f.snapshot.gateHistory![1]!.finishedAt, at(10).toISOString());
			assert.match(f.snapshot.gateHistory![1]!.failureReason!, /no longer valid/);
			assertUnchanged(f, () => f.record(completed(pending, "late approval", 11)), /stale|aborted/);
			const restored = restoreWorkflowRunStateFromBranch(f.branch);
			assert.equal(getActiveWorkflowRun(restored.state), null);
			assert.deepEqual(getWorkflowRunSnapshot(restored.state, f.input.runId)!.gateHistory, f.snapshot.gateHistory);
		});
	});
}

test("workflow replacement interrupts the old gate while retaining its audit history", () => {
	withFixture((f) => {
		const first = priorDecision(f);
		const pending = f.attempt("gate-2", 4);
		f.record(pending);
		const replaced = f.commit(startWorkflowRun(f.state, { ...f.input, runId: "replacement-run" }, {
			replaceActive: true, now: () => at(10),
		}));
		assert.equal(replaced.snapshots.length, 2);
		assert.equal(replaced.snapshots[0]!.runId, f.input.runId);
		assert.equal(replaced.snapshots[0]!.status, "aborted");
		assert.deepEqual(f.snapshot.gateHistory![0], first);
		assert.equal(f.snapshot.gateHistory![1]!.status, "interrupted");
		assert.match(f.snapshot.gateHistory![1]!.failureReason!, /replaced/);
		const active = getActiveWorkflowRun(f.state)!;
		assert.equal(active.runId, "replacement-run");
		assert.equal(active.gateHistory, undefined);
		assertUnchanged(f, () => f.record(completed(pending, "late approval", 11)), /stale|replaced/);
		const restored = restoreWorkflowRunStateFromBranch(f.branch);
		assert.equal(getActiveWorkflowRun(restored.state)!.runId, "replacement-run");
		assert.deepEqual(getWorkflowRunSnapshot(restored.state, f.input.runId)!.gateHistory, f.snapshot.gateHistory);
	});
});

test("completion rejects pending gates but preserves completed gate decisions in a terminal run", () => {
	withFixture((f) => {
		const pending = f.attempt();
		f.record(pending);
		assertUnchanged(f, () => f.commit(completeWorkflowRun(f.state, f.input.runId)), /gate .*pending/);
		const final = completed(pending);
		f.record(final);
		f.commit(completeWorkflowRun(f.state, f.input.runId, { now: () => at(10) }));
		assert.equal(getActiveWorkflowRun(f.state), null);
		assert.equal(f.snapshot.status, "completed");
		assert.deepEqual(f.snapshot.gateHistory, [final]);
		const restored = restoreWorkflowRunStateFromBranch(f.branch);
		assert.deepEqual(getWorkflowRunSnapshot(restored.state, f.input.runId)!.gateHistory, [final]);
		assertUnchanged(f, () => f.record({ ...final, feedback: "late rewrite" }), /stale|completed/);
	});
});

for (const status of ["starting", "running"] as const) {
	test(`pending gates reject ${status} role launches and session records before mutation`, () => {
		withFixture((f, root) => {
			const previousSession = join(root, "author-before.jsonl");
			f.commit(recordWorkflowRunRoleSession(f.state, f.input.runId, "author", previousSession, {
				launchStatus: "completed", now: () => at(0),
			}));
			f.record(f.attempt());
			assert.throws(() => assertNoPendingWorkflowGate(f.snapshot), /gate .*pending/);
			assertUnchanged(f, () => f.commit(setWorkflowRunActiveLaunch(f.state, f.input.runId, {
				roleId: "author", status, sessionPath: join(root, "author-new.jsonl"),
			})), /gate .*pending/);
			assertUnchanged(f, () => f.commit(recordWorkflowRunRoleSession(
				f.state, f.input.runId, "author", join(root, "author-new.jsonl"), { launchStatus: status },
			)), /gate .*pending/);
			assert.equal(f.snapshot.roleSessions.author!.current, previousSession);
			assert.deepEqual(f.snapshot.roleSessions.author!.history, []);
		});
	});

	test(`a new gate cannot overlap a ${status} workflow role`, () => {
		withFixture((f) => {
			f.commit(setWorkflowRunActiveLaunch(f.state, f.input.runId, { roleId: "author", status }));
			assertUnchanged(f, () => f.record(f.attempt(), { ticket: "must not be merged" }), /overlap an active workflow role/);
			assert.equal(f.snapshot.gateHistory, undefined);
			assert.equal(f.snapshot.data.ticket, "DOC-42");
		});
	});
}

test("another attempt cannot start while a gate is pending", () => {
	withFixture((f) => {
		f.record(f.attempt());
		assertUnchanged(f, () => f.record(f.attempt("gate-2", 2)), /gate .*pending/);
		assert.equal(f.snapshot.gateHistory!.length, 1);
	});
});

test("starting a gate atomically normalizes initial data and rejects invalid data without an attempt", () => {
	withFixture((f, root) => {
		assertUnchanged(f, () => f.record(f.attempt(), { unexpected: "value" }), /Unknown workflow data slot/);
		assertUnchanged(f, () => f.record(f.attempt(), { draft: "relative/DRAFT.md" }), /absolute/);
		assert.equal(f.snapshot.gateHistory, undefined);
		const newDraft = join(root, ".notes", "revised", "DRAFT.md");
		const attempt = {
			...f.attempt(), target: newDraft,
			resultPath: join(`${dirname(newDraft)}-decisions`, "draft-check-gate-1.json"),
		};
		const recorded = f.record(attempt, { draft: newDraft, ticket: "  DOC-99  " });
		assert.equal(recorded.snapshots.length, 1);
		assert.equal(recorded.snapshots[0]!.gateHistory![0]!.target, newDraft);
		assert.equal(recorded.snapshots[0]!.data.draft, newDraft);
		assert.equal(recorded.snapshots[0]!.data.ticket, "DOC-99");
		assert.equal(recorded.snapshots[0]!.data.check, f.check);
	});
});

test("mergeWorkflowRunData cannot change any data while a gate is pending", () => {
	withFixture((f, root) => {
		const pending = f.attempt();
		f.record(pending);
		const updates: WorkflowDataValueMap[] = [
			{ ticket: "changed" },
			{ draft: join(root, ".notes", "different", "DRAFT.md") },
			{ unknown: "not even validated before the pending guard" },
			{},
		];
		for (const data of updates) {
			assertUnchanged(f, () => f.commit(mergeWorkflowRunData(f.state, f.input.runId, data)), /gate .*pending/);
		}
		assertUnchanged(f, () => f.record({ ...pending, status: "running" }, { ticket: "bypass" }), /only be set when an attempt starts/);
		const final = completed(pending);
		f.record(final);
		f.commit(mergeWorkflowRunData(f.state, f.input.runId, { ticket: "  now allowed  " }, { now: () => at(4) }));
		assert.equal(f.snapshot.data.ticket, "now allowed");
		assert.deepEqual(f.snapshot.gateHistory, [final]);
	});
});

test("new records reject unknown/string slots, wrong run IDs, invalid states, and unsafe paths", () => {
	withFixture((f) => {
		const pending = f.attempt();
		const invalid: Partial<WorkflowGateAttempt>[] = [
			{ artifact: "missing" }, { artifact: "ticket" }, { artifact: "__proto__" },
			{ runId: "wrong-run" }, { status: "running" }, { gate: "../unsafe" },
			{ target: "/outside/DRAFT.md" }, { resultPath: "/outside/result.json" },
			{ resultPath: join(dirname(f.draft), "result.json") },
		];
		for (const patch of invalid) {
			assertUnchanged(f, () => f.record({ ...pending, ...patch }), /file slot|stale|starting status|safe lowercase|inside|outside/);
		}
		assert.equal(f.snapshot.gateHistory, undefined);
	});
});

test("malformed persisted histories never load as valid snapshots or imply approval", () => {
	withFixture((f) => {
		const pending = f.attempt();
		const final = completed(pending);
		const another = f.attempt("gate-2", 4);
		const invalid: unknown[] = [
			null, {}, "history",
			[null], [{ ...pending, unexpected: "field" }],
			[{ ...pending, artifact: "missing" }], [{ ...pending, artifact: "ticket" }],
			[{ ...pending, runId: "wrong-run" }],
			[{ ...pending, target: "/outside/DRAFT.md" }],
			[{ ...pending, resultPath: join(dirname(f.draft), "inside-review.json") }],
			[{ ...pending, gate: "../../unsafe" }],
			[{ ...pending, status: "approved" }],
			[{ ...pending, finishedAt: at(2).toISOString() }],
			[{ ...pending, status: "completed" }],
			[{ ...final, decision: "unknown" }],
			[{ ...final, feedback: null }], [{ ...final, feedback: 10 }],
			[{ ...final, exitCode: 1 }],
			[{ ...pending, status: "failed", finishedAt: at(1).toISOString() }],
			[pending, pending],
			[final, { ...another, resultPath: final.resultPath }],
			[pending, another],
			[pending, completed(another, "not allowed after pending", 5)],
		];
		for (const gateHistory of invalid) {
			const restored = restoreWorkflowRunStateFromBranch([entry({ ...f.snapshot, gateHistory })]);
			assert.equal(getActiveWorkflowRun(restored.state), null, JSON.stringify(gateHistory));
			assert.deepEqual(restored.snapshots, []);
		}
	});
});

test("an invalid latest approval cannot replace the preceding valid pending snapshot", () => {
	withFixture((f) => {
		const pending = f.attempt();
		f.record(pending);
		const invalid = { ...f.snapshot, gateHistory: [{ ...completed(pending), feedback: null }] };
		const restored = restoreWorkflowRunStateFromBranch([
			...f.branch, entry(invalid, f.branch.length),
		], { now: () => at(10) });
		const history = getActiveWorkflowRun(restored.state)!.gateHistory!;
		assert.equal(history.length, 1);
		assert.equal(history[0]!.status, "interrupted");
		assert.equal(history[0]!.decision, undefined);
		assert.equal(history[0]!.feedback, undefined);
	});
});

test("attempt identity fields cannot change during an update", () => {
	withFixture((f) => {
		const pending = f.attempt();
		f.record(pending);
		const patches: Partial<WorkflowGateAttempt>[] = [
			{ runId: "another-run" }, { id: "another-attempt" }, { sessionId: "another-parent" },
			{ gate: "another-gate" }, { artifact: "check" }, { target: f.check },
			{ resultPath: `${pending.resultPath}.new` }, { reviewDirectory: true },
			{ startedAt: at(2).toISOString() },
		];
		for (const patch of patches) {
			assertUnchanged(f, () => f.record({
				...pending, status: "running", updatedAt: at(2).toISOString(), ...patch,
			}), /identity changed|stale|gate .*pending/);
		}
		f.record({ ...pending, status: "running", updatedAt: at(2).toISOString(), sessionUrl: "http://localhost:4312/" });
		assert.equal(f.snapshot.gateHistory![0]!.sessionUrl, "http://localhost:4312/");
	});
});

test("attempt updates cannot move backwards in status or time", () => {
	withFixture((f) => {
		const pending = f.attempt();
		f.record(pending);
		const running = { ...pending, status: "running" as const, updatedAt: at(3).toISOString() };
		f.record(running);
		assertUnchanged(f, () => f.record({ ...running, status: "starting", updatedAt: at(4).toISOString() }), /cannot move backwards/);
		assertUnchanged(f, () => f.record({ ...running, updatedAt: at(2).toISOString() }), /cannot move backwards/);
	});
});

for (const status of ["completed", "failed", "interrupted"] as const) {
	test(`${status} attempts cannot be rewritten or revived, including duplicate final events`, () => {
		withFixture((f) => {
			const pending = f.attempt();
			f.record(pending);
			const final: WorkflowGateAttempt = status === "completed" ? completed(pending) : {
				...pending, status, failureReason: "Use chat fallback.", updatedAt: at(3).toISOString(), finishedAt: at(3).toISOString(),
			};
			f.record(final);
			assertUnchanged(f, () => f.record(final), /final or historical/);
			assertUnchanged(f, () => f.record(completed(pending, "rewritten decision", 4)), /final or historical/);
			assertUnchanged(f, () => f.record({ ...pending, status: "running", updatedAt: at(4).toISOString() }), /final or historical/);
		});
	});
}

test("historical attempt updates cannot overwrite the current pending gate", () => {
	withFixture((f) => {
		const first = priorDecision(f);
		const pending = f.attempt("gate-2", 4);
		f.record(pending);
		assertUnchanged(f, () => f.record({ ...first, feedback: "late rewrite", updatedAt: at(5).toISOString(), finishedAt: at(5).toISOString() }), /final or historical/);
		assert.equal(getPendingWorkflowGate(f.snapshot)!.id, pending.id);
		assert.deepEqual(f.snapshot.gateHistory![0], first);
	});
});

test("new attempts require both a fresh ID and a fresh result path even without any result files", () => {
	withFixture((f) => {
		const first = priorDecision(f);
		assertUnchanged(f, () => f.record({ ...f.attempt("gate-2", 4), id: first.id }), /final or historical/);
		assertUnchanged(f, () => f.record({ ...f.attempt("gate-2", 4), resultPath: first.resultPath }), /reused attempt IDs or result paths/);
		const fresh = f.attempt("gate-2", 4);
		f.record(fresh);
		assert.equal(f.snapshot.gateHistory!.length, 2);
		assert.deepEqual(f.snapshot.gateHistory, [first, fresh]);
	});
});
