import assert from "node:assert/strict";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
	createWorkflowGateController,
	getPendingWorkflowGate,
	hasPendingWorkflowGate,
	interruptWorkflowGateHistory,
	parseWorkflowGateAttempt,
	parseWorkflowGateDecision,
	parseWorkflowGateHistory,
	type WorkflowGateAttempt,
	type WorkflowGateDependencies,
	type WorkflowGateInput,
	type WorkflowGateNotification,
	type WorkflowGateRun,
} from "../../workflow/plannotator.ts";
import { loadWorkflowDefinitionFromPackage } from "../../workflow/schema.ts";
import { createWorkflowRunState, getActiveWorkflowRun, startWorkflowRun } from "../../workflow/state.ts";

const AT = new Date("2026-09-20T01:02:03.000Z");
const NOW = () => AT;

class FakeProcess extends EventEmitter {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly kills: string[] = [];
	kill(signal: string) { this.kills.push(signal); return true; }
}

function fixture(root: string, options: Partial<WorkflowGateDependencies> = {}) {
	const packagePath = join(root, "generic-workflow");
	mkdirSync(packagePath);
	writeFileSync(join(packagePath, "workflow.json"), JSON.stringify({
		version: 1,
		id: "quill",
		command: { name: "quill", description: "Draft a document" },
		skill: "SKILL.md",
		data: {
			draft: { kind: "file", label: "Draft", constraint: { under: ".notes", basename: "DRAFT.md" } },
			ticket: { kind: "string", label: "Ticket" },
		},
		roles: [{
			id: "author", label: "Author", agent: "scribe", reads: ["ticket"],
			writes: ["file:draft"], handoff: "Continue drafting.",
		}],
	}));
	writeFileSync(join(packagePath, "SKILL.md"), "---\nname: quill-private\ndescription: A private workflow\n---\n\nDraft something.");
	const loaded = loadWorkflowDefinitionFromPackage(packagePath);
	assert.equal(loaded.status, "ok");
	const artifact = join(root, ".notes", "draft with spaces;literal", "DRAFT.md");
	mkdirSync(dirname(artifact), { recursive: true });
	writeFileSync(artifact, "# Draft\n");
	const started = startWorkflowRun(createWorkflowRunState(), {
		runId: "test-run", source: "project", definition: loaded.definition,
		projectRoot: root, policy: "parent-per-role", assignmentSource: "parent",
		data: { draft: artifact, ticket: "issue-123" },
	}, { now: NOW });
	let run: WorkflowGateRun | null = getActiveWorkflowRun(started.state)!;
	let sessionId: string | null = "session-one";
	let id = 0;
	const children: FakeProcess[] = [];
	const persisted: WorkflowGateAttempt[] = [];
	const notices: WorkflowGateNotification[] = [];
	const errors: Error[] = [];
	const spawns: { command: string; args: string[]; options: SpawnOptions }[] = [];
	const controller = createWorkflowGateController({
		getActiveRun: () => run,
		getSessionId: () => sessionId,
		persistAttempt(attempt, data) {
			assert.ok(run);
			assert.equal(attempt.sessionId, sessionId, "must not persist into another session");
			persisted.push(attempt);
			const history = [...(run.gateHistory ?? [])];
			const index = history.findIndex((entry) => entry.id === attempt.id);
			if (index < 0) history.push(attempt);
			else history[index] = attempt;
			run = { ...run, data: { ...run.data, ...data }, gateHistory: history };
		},
		notify(notice) {
			assert.equal(notice.sessionId, sessionId);
			assert.equal(run?.gateHistory?.find((entry) => entry.id === notice.attemptId)?.status, notice.status);
			notices.push(notice);
		},
		spawn(command, args, options) {
			assert.equal(persisted.at(-1)?.status, "starting", "persist before spawn");
			assert.equal(existsSync(args.at(-1)!), false, "result must not be precreated");
			spawns.push({ command, args, options });
			const child = new FakeProcess();
			children.push(child);
			return child as unknown as ChildProcess;
		},
		now: NOW,
		newId: () => `attempt-${++id}`,
		onError: (error) => errors.push(error),
		...options,
	});
	const input: WorkflowGateInput = { runId: "test-run", gate: "draft", artifact: "draft" };
	return {
		controller, children, persisted, notices, errors, spawns, artifact, input,
		get run() { return run!; },
		setRun(value: WorkflowGateRun | null) { run = value; },
		setSession(value: string | null) { sessionId = value; },
		start(overrides: Partial<WorkflowGateInput> = {}) { return controller.start({ ...input, ...overrides }); },
		decision(result: unknown = { decision: "approved" }, code: number | null = 0, signal: string | null = null) {
			const path = run!.gateHistory!.at(-1)!.resultPath;
			writeFileSync(path, JSON.stringify(result));
			children.at(-1)!.emit("close", code, signal);
		},
	};
}

async function withFixture(
	body: (f: ReturnType<typeof fixture>, root: string) => Promise<void> | void,
	options?: Partial<WorkflowGateDependencies>,
) {
	const root = mkdtempSync(join(tmpdir(), "workflow-gate-"));
	const f = fixture(root, options);
	try { await body(f, root); }
	finally {
		f.controller.shutdown();
		rmSync(root, { recursive: true, force: true });
	}
}

test("gate returns an immediate acknowledgement and uses argument arrays, including paths with spaces", async () => {
	await withFixture((f, root) => {
		const ack = f.start({ data: { ticket: " new ticket " } });
		assert.equal(ack.status, "starting");
		assert.equal(ack.target, f.artifact);
		assert.equal(f.run.data.ticket, "new ticket");
		assert.equal(f.notices.length, 0);
		assert.equal(f.persisted.length, 1);
		assert.equal(hasPendingWorkflowGate(f.run), true);
		assert.deepEqual(f.spawns, [{
			command: "plannotator",
			args: ["annotate", f.artifact, "--gate", "--json", "--result-file", ack.resultPath],
			options: { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: false },
		}]);
		assert.equal(dirname(ack.resultPath), `${dirname(f.artifact)}-decisions`);
		f.children[0]!.emit("spawn");
		assert.equal(f.persisted.at(-1)!.status, "running");
		f.decision();
		assert.equal(f.persisted.at(-1)!.status, "completed");
		assert.equal(f.notices.length, 1);
		assert.equal(f.notices[0]!.type, "workflow_gate_result");
		assert.equal(hasPendingWorkflowGate(f.run), false);
	});
});

test("directory reviews exclude the sibling decisions directory", async () => {
	await withFixture((f) => {
		const ack = f.start({ reviewDirectory: true });
		assert.equal(ack.target, dirname(f.artifact));
		assert.equal(f.spawns[0]!.args[1], dirname(f.artifact));
		assert.equal(dirname(ack.resultPath), `${ack.target}-decisions`);
		f.decision({ decision: "annotated", feedback: "Folder Feedback\n  /absolute/file:\n notes " });
		assert.equal(f.persisted.at(-1)!.reviewDirectory, true);
	});
});

test("no result is read on output, exit, or error: only close is authoritative", async () => {
	await withFixture((f) => {
		const ack = f.start();
		writeFileSync(ack.resultPath, JSON.stringify({ decision: "approved", feedback: "early" }));
		f.children[0]!.stdout.write("Opening browser\n");
		f.children[0]!.emit("exit", 0, null);
		assert.equal(f.notices.length, 0);
		assert.equal(f.persisted.at(-1)!.decision, undefined);
		writeFileSync(ack.resultPath, JSON.stringify({ decision: "annotated", feedback: "last write" }));
		f.children[0]!.emit("close", 0, null);
		assert.equal(f.persisted.at(-1)!.decision, "annotated");
		assert.equal(f.persisted.at(-1)!.feedback, "last write");
	});
});

test("URL output is pushed once, across chunks and ANSI escapes, without finalizing", async () => {
	await withFixture((f) => {
		f.start();
		f.children[0]!.emit("spawn");
		f.children[0]!.stderr.write("\x1b[32mOpen http://local");
		f.children[0]!.stderr.write("host:4312/review?token=abc\x1b[0m\n");
		f.children[0]!.stdout.write("http://localhost:4312/review?token=abc\n");
		assert.equal(f.notices.length, 1);
		assert.equal(f.notices[0]!.type, "workflow_gate_opened");
		assert.equal(f.persisted.at(-1)!.sessionUrl, "http://localhost:4312/review?token=abc");
		assert.equal(hasPendingWorkflowGate(f.run), true);
		f.decision();
		assert.equal(f.notices.filter((entry) => entry.type === "workflow_gate_result").length, 1);
	});
});

test("URLs inside result JSON are feedback, not browser readiness notifications", async () => {
	await withFixture((f) => {
		f.start();
		const result = { decision: "approved", feedback: "See https://example.test/notes for context." };
		f.children[0]!.stdout.write(`${JSON.stringify(result)}\n`);
		assert.equal(f.notices.length, 0);
		f.decision(result);
		assert.equal(f.notices.length, 1);
		assert.equal(f.notices[0]!.type, "workflow_gate_result");
		assert.equal(f.persisted.at(-1)!.sessionUrl, undefined);
		assert.equal(f.persisted.at(-1)!.feedback, result.feedback);
	});
});

for (const result of [
	{ decision: "approved" },
	{ decision: "approved", feedback: "" },
	{ decision: "approved", feedback: " \n\tApproval notes\r\n  " },
	{ decision: "annotated", feedback: "\n  Revise only this.\n\n" },
	{ decision: "dismissed" },
] as const) {
	test(`valid ${JSON.stringify(result)} preserves feedback through JSON snapshot round-trip`, async () => {
		await withFixture((f) => {
			f.start();
			f.decision(result);
			const attempt = f.persisted.at(-1)!;
			assert.equal(attempt.status, "completed");
			assert.equal(attempt.decision, result.decision);
			assert.equal(attempt.feedback, "feedback" in result ? result.feedback : undefined);
			const history = parseWorkflowGateHistory(JSON.parse(JSON.stringify(f.run.gateHistory)), f.run)!;
			assert.deepEqual(history.at(-1), attempt);
			if ("feedback" in result) assert.ok(f.notices.at(-1)!.content.includes(`\n${result.feedback}\n</workflow_gate_feedback>`));
			if (result.decision === "dismissed") assert.match(f.notices.at(-1)!.content, /chat fallback/);
		});
	});
}

test("large feedback is never truncated in persistence or the file; the message points to a full read", async () => {
	await withFixture((f) => {
		const ack = f.start();
		f.children[0]!.stdout.write("x".repeat(20_000));
		const feedback = ` \n${"raw ☃\r\n".repeat(30_000)}\t `;
		f.decision({ decision: "approved", feedback });
		const attempt = f.persisted.at(-1)!;
		assert.equal(attempt.feedback, feedback);
		assert.equal(JSON.parse(readFileSync(ack.resultPath, "utf8")).feedback, feedback);
		assert.equal(attempt.logs!.length, 256);
		assert.match(f.notices.at(-1)!.content, /Read the full feedback from the result file/);
		assert.ok(f.notices.at(-1)!.content.length < 1_024);
		assert.ok(f.notices.at(-1)!.content.includes(ack.resultPath));
	}, { maxLogChars: 256, maxMessageChars: 1_024 });
});

for (const result of [
	null, [], {}, "approved", { decision: "APPROVED" }, { decision: "unknown" },
	{ decision: "approved", feedback: null }, { decision: "approved", feedback: 42 },
	{ decision: "annotated", feedback: [] }, { decision: "approved", feedback: {} },
]) {
	test(`malformed decision ${JSON.stringify(result)} fails closed`, async () => {
		await withFixture((f) => {
			f.start();
			f.decision(result);
			assert.equal(f.persisted.at(-1)!.status, "failed");
			assert.equal(f.persisted.at(-1)!.decision, undefined);
			assert.match(f.notices.at(-1)!.content, /chat fallback/);
		});
	});
}

test("missing file and invalid JSON fail closed", async () => {
	await withFixture((f) => {
		f.start();
		f.children[0]!.emit("close", 0, null);
		assert.equal(f.persisted.at(-1)!.status, "failed");
		const ack = f.start();
		writeFileSync(ack.resultPath, "{invalid");
		f.children[1]!.emit("close", 0, null);
		assert.equal(f.persisted.at(-1)!.status, "failed");
		assert.equal(f.notices.length, 2);
	});
});

for (const [code, signal] of [[1, null], [null, "SIGTERM"], [null, null]] as const) {
	test(`non-successful exit ${code}/${signal} never trusts an approved result file`, async () => {
		await withFixture((f) => {
			f.start();
			f.decision({ decision: "approved" }, code, signal);
			assert.equal(f.persisted.at(-1)!.status, "failed");
			assert.equal(f.persisted.at(-1)!.decision, undefined);
		});
	});
}

test("missing binary/error waits for close and produces one final fallback event", async () => {
	await withFixture((f) => {
		f.start();
		f.children[0]!.emit("error", Object.assign(new Error("spawn plannotator ENOENT"), { code: "ENOENT" }));
		assert.equal(f.notices.length, 0);
		f.decision({ decision: "approved" });
		f.children[0]!.emit("close", 0, null);
		f.children[0]!.emit("error", new Error("duplicate error"));
		assert.equal(f.notices.length, 1);
		assert.equal(f.persisted.at(-1)!.status, "failed");
		assert.match(f.persisted.at(-1)!.failureReason!, /ENOENT/);
	});
});

test("synchronous spawn failure still returns an ack before delivering a persisted fallback", async () => {
	await withFixture(async (f) => {
		const ack = f.start();
		assert.equal(ack.status, "starting");
		assert.equal(f.notices.length, 0);
		await Promise.resolve();
		assert.equal(f.notices.length, 1);
		assert.equal(f.persisted.at(-1)!.status, "failed");
		assert.match(f.notices[0]!.content, /spawn failed/);
	}, { spawn: () => { throw new Error("spawn failed"); } });
});

test("stale runs, unsafe gates, non-file slots, invalid updates, and unreadable targets reject before spawn", async () => {
	await withFixture((f) => {
		const invalid: Partial<WorkflowGateInput>[] = [
			{ runId: "old-run" }, { gate: "../../outside" }, { gate: "draft; echo" },
			{ gate: "UPPER" }, { gate: "-option" }, { gate: "x".repeat(65) },
			{ artifact: "ticket" }, { artifact: "absent" }, { artifact: "__proto__" },
			{ data: { unknown: "x" } }, { data: { draft: "relative/DRAFT.md" } },
			{ reviewDirectory: "yes" as unknown as boolean },
		];
		for (const params of invalid) assert.throws(() => f.start(params));
		f.setSession(null);
		assert.throws(() => f.start(), /session/);
		f.setSession("session-one");
		rmSync(f.artifact);
		assert.throws(() => f.start(), /ENOENT/);
		assert.equal(f.spawns.length, 0);
		assert.equal(f.persisted.length, 0);
	});
});

test("one pending gate per run and no active role overlap", async () => {
	await withFixture((f) => {
		for (const status of ["starting", "running"] as const) {
			f.setRun({ ...f.run, activeLaunch: { roleId: "author", status } });
			assert.throws(() => f.start(), /active workflow role/);
		}
		f.setRun({ ...f.run, activeLaunch: { roleId: "author", status: "completed" } });
		f.start();
		assert.throws(() => f.start(), /pending browser gate/);
		assert.equal(f.spawns.length, 1);
		assert.equal(getPendingWorkflowGate(f.run)?.id, "attempt-1");
	});
});

test("file targets escaping through symlinks are rejected before any process", async () => {
	const outside = mkdtempSync(join(tmpdir(), "gate-outside-"));
	try {
		writeFileSync(join(outside, "DRAFT.md"), "outside");
		await withFixture((f) => {
			rmSync(f.artifact);
			symlinkSync(join(outside, "DRAFT.md"), f.artifact);
			assert.throws(() => f.start(), /inside the project root/);
			assert.equal(f.spawns.length, 0);
		});
		await withFixture((f) => {
			rmSync(dirname(f.artifact), { recursive: true });
			symlinkSync(outside, dirname(f.artifact));
			assert.throws(() => f.start({ reviewDirectory: true }), /inside the project root/);
			assert.equal(f.spawns.length, 0);
		});
	} finally { rmSync(outside, { recursive: true, force: true }); }
});

test("decision directory symlinks cannot escape the project or enter the reviewed folder", async () => {
	const outside = mkdtempSync(join(tmpdir(), "gate-outside-"));
	try {
		await withFixture((f) => {
			symlinkSync(outside, `${dirname(f.artifact)}-decisions`);
			assert.throws(() => f.start(), /canonical project root/);
			assert.equal(f.spawns.length, 0);
		});
		await withFixture((f) => {
			symlinkSync(dirname(f.artifact), `${dirname(f.artifact)}-decisions`);
			assert.throws(() => f.start({ reviewDirectory: true }), /outside the artifact directory/);
		});
	} finally { rmSync(outside, { recursive: true, force: true }); }
});

test("canonical contained symlink targets are supported", async () => {
	await withFixture((f, root) => {
		const actual = join(root, ".notes", "actual", "DRAFT.md");
		mkdirSync(dirname(actual));
		writeFileSync(actual, "actual draft");
		rmSync(f.artifact);
		symlinkSync(actual, f.artifact);
		const ack = f.start();
		assert.equal(ack.target, actual);
		assert.equal(dirname(ack.resultPath), `${dirname(actual)}-decisions`);
	});
});

test("result-file and changed decision-directory symlinks fail closed after close", async () => {
	await withFixture((f, root) => {
		const elsewhere = join(root, "approved.json");
		writeFileSync(elsewhere, JSON.stringify({ decision: "approved" }));
		const ack = f.start();
		symlinkSync(elsewhere, ack.resultPath);
		f.children[0]!.emit("close", 0, null);
		assert.equal(f.persisted.at(-1)!.status, "failed");
		const second = f.start();
		const directory = dirname(second.resultPath);
		rmSync(directory, { recursive: true });
		symlinkSync(dirname(f.artifact), directory);
		f.children[1]!.emit("close", 0, null);
		assert.equal(f.persisted.at(-1)!.status, "failed");
	});
});

test("result paths are unique in a fixed timestamp and never overwrite existing or dangling symlinks", async () => {
	let next = 0;
	await withFixture((f) => {
		const dir = `${dirname(f.artifact)}-decisions`;
		mkdirSync(dir);
		const first = join(dir, "draft-20260920T010203000Z-id-1.json");
		const second = join(dir, "draft-20260920T010203000Z-id-2.json");
		writeFileSync(first, "do not overwrite");
		symlinkSync(join(dir, "missing"), second);
		const ack = f.start();
		assert.match(ack.resultPath, /id-3\.json$/);
		f.decision();
		const nextAck = f.start();
		assert.notEqual(nextAck.resultPath, ack.resultPath);
		assert.equal(readFileSync(first, "utf8"), "do not overwrite");
		assert.equal(existsSync(nextAck.resultPath), false);
	}, { newId: () => `id-${++next}` });
});

test("history and in-memory reservations forbid reuse even when the old result file was deleted", async () => {
	await withFixture((f) => {
		const ack = f.start();
		f.decision();
		rmSync(ack.resultPath);
		assert.throws(() => f.start(), /never reused/);
		assert.equal(f.spawns.length, 1);
	}, { newId: () => "same-id" });
});

for (const reason of ["abort", "workflow replacement", "session replacement", "reload", "shutdown"]) {
	test(`${reason} interrupts the owned process, preserves files, and ignores late/duplicate events`, async () => {
		await withFixture((f) => {
			const ack = f.start();
			writeFileSync(ack.resultPath, JSON.stringify({ decision: "approved" }));
			if (reason === "shutdown") f.controller.shutdown(reason);
			else f.controller.interrupt(reason);
			assert.equal(f.persisted.at(-1)!.status, "interrupted");
			assert.deepEqual(f.children[0]!.kills, ["SIGTERM"]);
			assert.equal(f.children[0]!.listenerCount("close"), 0);
			assert.equal(f.children[0]!.stdout.listenerCount("data"), 0);
			f.children[0]!.emit("spawn");
			f.children[0]!.emit("close", 0, null);
			f.children[0]!.emit("error", new Error("late"));
			f.children[0]!.stdout.write("http://localhost:1234/\n");
			assert.equal(f.notices.length, 0);
			assert.equal(existsSync(ack.resultPath), true);
			assert.equal(existsSync(f.artifact), true);
			f.controller.interrupt(reason);
			assert.deepEqual(f.children[0]!.kills, ["SIGTERM"]);
			if (reason === "shutdown") assert.throws(() => f.start(), /shut down/);
		});
	});
}

test("a stale close cannot complete a newer attempt in the same run", async () => {
	await withFixture((f) => {
		f.start();
		f.controller.interrupt("retry");
		const second = f.start();
		f.children[0]!.emit("close", 0, null);
		assert.equal(f.notices.length, 0);
		assert.equal(getPendingWorkflowGate(f.run)?.id, second.attemptId);
		f.decision();
		assert.equal(f.notices[0]!.attemptId, second.attemptId);
	});
});

for (const changed of ["session", "run", "attempt"] as const) {
	test(`changed ${changed} ownership suppresses all persistence and notifications`, async () => {
		await withFixture((f) => {
			const ack = f.start();
			writeFileSync(ack.resultPath, JSON.stringify({ decision: "approved" }));
			const writes = f.persisted.length;
			if (changed === "session") f.setSession("session-two");
			else if (changed === "run") f.setRun({ ...f.run, runId: "replacement" });
			else f.setRun({ ...f.run, gateHistory: [{ ...f.run.gateHistory![0]!, id: "replacement" }] });
			f.children[0]!.emit("close", 0, null);
			assert.equal(f.persisted.length, writes);
			assert.equal(f.notices.length, 0);
			assert.deepEqual(f.children[0]!.kills, ["SIGTERM"]);
		});
	});
}

test("strict history parsing accepts old snapshots and interrupts pending records on restore", async () => {
	await withFixture((f) => {
		assert.equal(parseWorkflowGateHistory(undefined), undefined);
		assert.equal(interruptWorkflowGateHistory(undefined), undefined);
		assert.equal(hasPendingWorkflowGate(null), false);
		f.start();
		const history = parseWorkflowGateHistory(JSON.parse(JSON.stringify(f.run.gateHistory)), f.run)!;
		const interrupted = interruptWorkflowGateHistory(history, "reload: use chat fallback", NOW)!;
		assert.equal(interrupted[0]!.status, "interrupted");
		assert.equal(interrupted[0]!.failureReason, "reload: use chat fallback");
		assert.equal(history[0]!.status, "starting");
		assert.deepEqual(parseWorkflowGateHistory(interrupted, f.run), interrupted);
	});
});

test("strict history parser rejects inconsistent fields, statuses, paths, and reused attempts", async () => {
	await withFixture((f) => {
		f.start();
		const attempt = f.run.gateHistory![0]!;
		for (const patch of [
			{ extra: true }, { id: "../oops" }, { gate: "../oops" }, { status: "accepted" },
			{ target: "relative" }, { target: "/tmp/../file" }, { resultPath: join(dirname(f.artifact), "decision.json") },
			{ reviewDirectory: "yes" }, { startedAt: "yesterday" }, { updatedAt: "2020-01-01T00:00:00.000Z" },
			{ finishedAt: AT.toISOString() }, { decision: "approved" }, { feedback: "" },
			{ failureReason: "failed" }, { sessionUrl: "file:///tmp/private" }, { logs: [] },
			{ exitCode: 0 }, { signal: "SIGTERM" },
			{ status: "completed", finishedAt: AT.toISOString(), decision: "approved" },
			{ status: "failed", finishedAt: AT.toISOString() },
		]) assert.throws(() => parseWorkflowGateAttempt({ ...attempt, ...patch }), JSON.stringify(patch));
		assert.throws(() => parseWorkflowGateHistory([attempt, attempt]), /reused/);
		assert.throws(() => parseWorkflowGateHistory([{ ...attempt, artifact: "ticket" }], f.run), /file slot/);
		assert.throws(() => parseWorkflowGateHistory([{ ...attempt, runId: "different" }], f.run), /runId/);
		assert.throws(() => parseWorkflowGateHistory([{ ...attempt, target: "/elsewhere/file" }], f.run), /inside/);
		assert.throws(() => parseWorkflowGateHistory([
			attempt, { ...attempt, id: "second", resultPath: `${attempt.resultPath}.2` },
		]), /latest/);
	});
});

test("persistence failure prevents launch and no unpersisted outcome is delivered", async () => {
	let f: ReturnType<typeof fixture>;
	const root = mkdtempSync(join(tmpdir(), "workflow-gate-"));
	try {
		f = fixture(root, { persistAttempt: () => { throw new Error("disk full"); } });
		assert.throws(() => f.start(), /disk full/);
		assert.equal(f.spawns.length, 0);
		assert.equal(f.notices.length, 0);
		f.controller.shutdown();
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("terminal persistence failure does not emit a completion decision", async () => {
	const root = mkdtempSync(join(tmpdir(), "workflow-gate-"));
	try {
		const f = fixture(root);
		let run = f.run;
		const errors: Error[] = [];
		const notices: WorkflowGateNotification[] = [];
		const child = new FakeProcess();
		const controller = createWorkflowGateController({
			getActiveRun: () => run,
			getSessionId: () => "parent",
			persistAttempt(attempt) {
				if (attempt.status !== "starting") throw new Error("disk full on result");
				run = { ...run, gateHistory: [attempt] };
			},
			notify: (notice) => notices.push(notice),
			onError: (error) => errors.push(error),
			spawn: () => child as unknown as ChildProcess,
			now: NOW,
		});
		const ack = controller.start(f.input);
		writeFileSync(ack.resultPath, JSON.stringify({ decision: "approved" }));
		child.emit("close", 0, null);
		assert.equal(notices.length, 0);
		assert.equal(run.gateHistory![0]!.status, "starting");
		assert.match(errors[0]!.message, /disk full/);
		controller.shutdown();
		f.controller.shutdown();
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("a real injected Node child completes asynchronously without launching a browser", async () => {
	let child: ChildProcess | undefined;
	await withFixture(async (f) => {
		const ack = f.start();
		assert.equal(f.persisted.at(-1)!.status, "starting");
		assert.equal(f.notices.length, 0);
		assert.ok(child);
		await new Promise<void>((resolve, reject) => {
			child!.once("close", () => resolve());
			child!.once("error", reject);
		});
		assert.equal(f.persisted.at(-1)!.status, "completed");
		assert.equal(f.persisted.at(-1)!.feedback, " \n real child \r\n ");
		assert.equal(f.notices.filter((event) => event.type === "workflow_gate_result").length, 1);
		assert.equal(existsSync(ack.resultPath), true);
	}, {
		spawn(_command, args, options) {
			child = spawn(process.execPath, ["-e", [
				"require('node:fs').writeFileSync(process.argv[1], JSON.stringify({ decision: 'approved', feedback: ' \\n real child \\r\\n ' }));",
				"console.log('Open http://localhost:4567/review');",
			].join("\n"), args.at(-1)!], options);
			return child;
		},
	});
});

test("decision parser preserves empty feedback and rejects explicit undefined", () => {
	assert.deepEqual(parseWorkflowGateDecision({ decision: "approved", feedback: "", metadata: "ignored" }), { decision: "approved", feedback: "" });
	assert.throws(() => parseWorkflowGateDecision({ decision: "approved", feedback: undefined }), /string/);
});
