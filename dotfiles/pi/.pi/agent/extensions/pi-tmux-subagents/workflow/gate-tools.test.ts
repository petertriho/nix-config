import assert from "node:assert/strict";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	isWorkflowGateParent,
	registerWorkflowGateTool,
	type WorkflowGateRuntimeOptions,
} from "./gate-tools.ts";
import type {
	WorkflowGateAcknowledgement,
	WorkflowGateInput,
	WorkflowGateNotification,
} from "./plannotator.ts";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	abortWorkflowRun,
	createWorkflowRunState,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	startWorkflowRun,
	type StartWorkflowRunInput,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import {
	createWorkflowLifecycleTools,
	type WorkflowToolDependencies,
	type WorkflowToolStateStore,
} from "./tools.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

interface CapturedMessage {
	customType: string;
	content: string;
	display?: boolean;
	details?: WorkflowGateNotification;
}

interface DeliveryOptions {
	deliverAs: string;
	triggerTurn: boolean;
}

interface GateTool {
	name: string;
	execute(
		id: string,
		params: WorkflowGateInput,
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: { sessionManager: { getSessionFile(): string | undefined } },
	): Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: WorkflowGateAcknowledgement;
	}>;
}

class FakePi {
	readonly tools: GateTool[] = [];
	readonly messages: Array<{ message: CapturedMessage; options: DeliveryOptions }> = [];
	onSend?: (message: CapturedMessage) => void;

	registerTool(tool: GateTool): void {
		this.tools.push(tool);
	}

	sendMessage(message: CapturedMessage, options: DeliveryOptions): void {
		this.onSend?.(message);
		this.messages.push({ message, options });
	}

	gate(): GateTool {
		const tool = this.tools.find((candidate) => candidate.name === "workflow_gate");
		assert.ok(tool, "workflow_gate must be registered");
		return tool;
	}

	results() {
		return this.messages.filter(({ message }) => message.customType === "workflow_gate_result");
	}
}

class Store implements WorkflowToolStateStore {
	state: WorkflowRunState;
	readonly persisted: WorkflowRunTransitionResult["snapshots"][number][] = [];
	fault?: (transition: WorkflowRunTransitionResult) => "before" | "after" | undefined;

	constructor(state: WorkflowRunState) {
		this.state = state;
	}

	getState(): WorkflowRunState {
		return this.state;
	}

	commit(transition: WorkflowRunTransitionResult): void {
		const fault = this.fault?.(transition);
		if (fault === "before") throw new Error("injected persistence failure");
		this.state = transition.state;
		if (fault === "after") throw new Error("injected failure after live state changed");
		this.persisted.push(...transition.snapshots);
	}
}

class Child extends EventEmitter {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly kills: Array<NodeJS.Signals | number | undefined> = [];

	kill(signal?: NodeJS.Signals | number): boolean {
		this.kills.push(signal);
		return true;
	}

	close(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
		this.emit("close", code, signal);
	}
}

function definitionFixture(root: string): NormalizedWorkflowDefinition {
	const packagePath = join(root, "folio-review");
	mkdirSync(packagePath);
	writeFileSync(join(packagePath, "workflow.json"), JSON.stringify({
		version: 1,
		id: "folio-review",
		command: { name: "folio-review", description: "Write and verify a documentation folio" },
		skill: "SKILL.md",
		data: {
			draft: {
				kind: "file",
				label: "Folio draft",
				constraint: { under: ".notes", basename: "DRAFT.md" },
			},
			ticket: { kind: "string", label: "Documentation ticket" },
		},
		roles: [{
			id: "scribe",
			label: "Folio author",
			agent: "documentation-scribe",
			reads: ["draft", "ticket"],
			writes: ["file:draft"],
			handoff: "Continue the durable folio draft.",
		}],
	}));
	writeFileSync(join(packagePath, "SKILL.md"), [
		"---",
		"name: folio-private",
		"description: Private folio orchestration.",
		"---",
		"Use workflow tools and explicit user decisions.",
	].join("\n"));
	const loaded = loadWorkflowDefinitionFromPackage(packagePath);
	assert.equal(loaded.status, "ok");
	return loaded.definition;
}

function harness(root: string, options: WorkflowGateRuntimeOptions = {}) {
	const definition = definitionFixture(root);
	const artifactDirectory = join(root, ".notes", "folio with spaces");
	mkdirSync(artifactDirectory, { recursive: true });
	const artifact = join(artifactDirectory, "DRAFT.md");
	writeFileSync(artifact, "# Durable folio\n");
	const sessionFile = join(root, "parent.jsonl");
	writeFileSync(sessionFile, "{}\n");
	const input = (runId = "run-folio"): StartWorkflowRunInput => ({
		runId,
		source: "project",
		definition,
		projectRoot: root,
		policy: "parent-per-role",
		assignmentSource: "parent",
		data: { draft: artifact, ticket: "DOC-17" },
	});
	const store = new Store(startWorkflowRun(createWorkflowRunState(), input()).state);
	const pi = new FakePi();
	const errors: Error[] = [];
	const children: Child[] = [];
	const spawns: Array<{ command: string; args: string[]; options: SpawnOptions }> = [];
	let sequence = 0;
	const runtime = registerWorkflowGateTool(pi as unknown as ExtensionAPI, store, {
		isParent: () => true,
		onError: (error) => errors.push(error),
		...options,
		transport: {
			now: () => new Date("2026-09-01T12:00:00.000Z"),
			newId: () => `attempt-${++sequence}`,
			spawn: (command, args, spawnOptions) => {
				assert.equal(getActiveWorkflowRun(store.state)?.gateHistory?.at(-1)?.status, "starting");
				const child = new Child();
				children.push(child);
				spawns.push({ command, args, options: spawnOptions });
				return child as unknown as ChildProcess;
			},
			...options.transport,
		},
	});
	const context = (file: string | undefined = sessionFile) => ({
		sessionManager: { getSessionFile: () => file },
	});
	const start = (updates: Partial<WorkflowGateInput> = {}, file = sessionFile, signal?: AbortSignal) =>
		pi.gate().execute("gate-call", {
			runId: getActiveWorkflowRun(store.state)!.runId,
			gate: "draft-check",
			artifact: "draft",
			...updates,
		}, signal, undefined, context(file));
	const latest = () => {
		const attempt = getActiveWorkflowRun(store.state)?.gateHistory?.at(-1);
		assert.ok(attempt);
		return attempt;
	};
	return { definition, artifact, artifactDirectory, sessionFile, input, store, pi, errors, children, spawns, runtime, context, start, latest };
}

type Harness = ReturnType<typeof harness>;

async function withHarness(
	run: (fixture: Harness) => void | Promise<void>,
	options: WorkflowGateRuntimeOptions = {},
): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "workflow-gate-tools-"));
	const fixture = harness(root, options);
	try {
		await run(fixture);
	} finally {
		fixture.store.fault = undefined;
		fixture.runtime.shutdown();
		rmSync(root, { recursive: true, force: true });
	}
}

function writeDecision(path: string, feedback = "  Keep these notes.\n", decision = "approved"): void {
	writeFileSync(path, JSON.stringify({ decision, feedback }));
}

function assertDetached(child: Child): void {
	assert.equal(child.listenerCount("close"), 0);
	assert.equal(child.listenerCount("spawn"), 0);
	assert.equal(child.stdout.listenerCount("data"), 0);
	assert.equal(child.stderr.listenerCount("data"), 0);
}

test("gate registration honors parent identity and denied-tool policy", async () => {
	assert.equal(isWorkflowGateParent({}), true);
	for (const key of ["PI_SUBAGENT_ID", "PI_SUBAGENT_NAME", "PI_SUBAGENT_AGENT"]) {
		assert.equal(isWorkflowGateParent({ [key]: "child" }), false, key);
		assert.equal(isWorkflowGateParent({ [key]: "" }), true, key);
	}
	await withHarness(({ pi }) => assert.equal(pi.tools.length, 0), { isParent: () => false });
	const checked: string[] = [];
	await withHarness(({ pi }) => assert.equal(pi.tools.length, 0), {
		shouldRegister: (name) => { checked.push(name); return false; },
	});
	assert.deepEqual(checked, ["workflow_gate"]);
	let parent = true;
	await withHarness(async (h) => {
		assert.equal(h.pi.tools.length, 1);
		h.runtime.startSession(h.sessionFile);
		parent = false;
		await assert.rejects(h.start(), /Only the parent orchestrator/);
		assert.equal(h.spawns.length, 0);
		assert.equal(h.store.persisted.length, 0);
	}, { isParent: () => parent });
});

test("gate execution requires the active persistent session and honors launch cancellation", async () => {
	await withHarness(async (h) => {
		await assert.rejects(h.start(), /current persistent parent session/);
		h.runtime.startSession(undefined);
		await assert.rejects(h.start(), /current persistent parent session/);
		h.runtime.startSession(h.sessionFile);
		await assert.rejects(h.start({}, `${h.sessionFile}.wrong`), /current persistent parent session/);
		const abort = new AbortController();
		abort.abort();
		await assert.rejects(h.start({}, h.sessionFile, abort.signal), /launch cancelled/);
		assert.equal(h.store.persisted.length, 0);
		assert.equal(h.spawns.length, 0);
		const acknowledgement = await h.start();
		assert.equal(acknowledgement.details.status, "starting");
		assert.equal(h.spawns.length, 1);
		assert.ok(h.latest().sessionId);
	});
});

test("gate acknowledges before close, delivers a nontriggering URL, and steers one persisted verbatim result", async () => {
	await withHarness(async (h) => {
		h.runtime.startSession(h.sessionFile);
		const result = await h.start({ data: { ticket: "DOC-18" }, reviewDirectory: true });
		const { resultPath, attemptId } = result.details;
		assert.match(result.content[0].text, /launched asynchronously/);
		assert.equal(h.latest().status, "starting");
		assert.equal(h.latest().id, attemptId);
		assert.equal(existsSync(resultPath), false, "result files must not be precreated");
		assert.equal(getActiveWorkflowRun(h.store.state)?.data.ticket, "DOC-18");
		assert.deepEqual(h.spawns[0], {
			command: "plannotator",
			args: ["annotate", h.artifactDirectory, "--gate", "--json", "--result-file", resultPath],
			options: { cwd: h.input().projectRoot, stdio: ["ignore", "pipe", "pipe"], shell: false },
		});
		const child = h.children[0];
		child.emit("spawn");
		assert.equal(h.latest().status, "running");
		child.stdout.write("Review: http://127.0.0.1:43819/session/folio\n");
		assert.equal(h.pi.messages.length, 1);
		assert.equal(h.pi.messages[0].message.customType, "workflow_gate_opened");
		assert.deepEqual(h.pi.messages[0].options, { triggerTurn: false });
		assert.equal(h.latest().sessionUrl, "http://127.0.0.1:43819/session/folio");
		const feedback = " \tFolder Feedback\n\n  /absolute/DRAFT.md:\n  Keep é and 漢字.\r\n\n\t ";
		writeDecision(resultPath, feedback);
		assert.equal(h.pi.results().length, 0, "an existing result file must not trigger early delivery");
		assert.equal(h.latest().feedback, undefined);
		child.emit("exit", 0, null);
		assert.equal(h.pi.results().length, 0, "exit is not process closure");
		h.pi.onSend = (message) => {
			if (message.customType === "workflow_gate_result") {
				assert.equal(h.store.persisted.at(-1)?.gateHistory?.at(-1)?.status, "completed");
				assert.equal(h.store.persisted.at(-1)?.gateHistory?.at(-1)?.feedback, feedback);
			}
		};
		child.close();
		child.close();
		child.emit("error", new Error("late duplicate"));
		child.stdout.write("http://127.0.0.1:43819/late\n");
		assert.equal(h.pi.results().length, 1);
		const final = h.pi.results()[0];
		assert.deepEqual(final.options, { deliverAs: "steer", triggerTurn: true });
		assert.equal(final.message.details?.attemptId, attemptId);
		assert.equal(final.message.details?.decision, "approved");
		assert.ok(final.message.content.includes(`<workflow_gate_feedback>\n${feedback}\n</workflow_gate_feedback>`));
		assert.equal(h.latest().feedback, feedback);
		assert.equal(JSON.parse(readFileSync(resultPath, "utf8")).feedback, feedback);
		assertDetached(child);
		assert.deepEqual(h.errors, []);
	});
});

test("large feedback is preserved completely in persistence and file while the result directs a full-file read", async () => {
	await withHarness(async (h) => {
		h.runtime.startSession(h.sessionFile);
		const result = await h.start();
		const feedback = ` \n${"  Authoritative file notes: λ漢字.\r\n".repeat(1_500)}\t `;
		assert.ok(feedback.length > 24_000);
		writeDecision(result.details.resultPath, feedback, "annotated");
		h.children[0].close();
		const content = h.pi.results()[0].message.content;
		assert.match(content, /Read the full feedback from the result file before acting/);
		assert.ok(content.includes(result.details.resultPath));
		assert.doesNotMatch(content, /Authoritative file notes|<workflow_gate_feedback>/);
		assert.ok(content.length < 24_000);
		assert.equal(h.latest().feedback, feedback);
		assert.equal(h.store.persisted.at(-1)?.gateHistory?.at(-1)?.feedback, feedback);
		assert.equal(JSON.parse(readFileSync(result.details.resultPath, "utf8")).feedback, feedback);
		assert.equal(h.latest().decision, "annotated");
	});
});

test("abort and replacement through the wrapped state stop children and reject every old completion", async () => {
	for (const action of ["abort", "replace"] as const) {
		await withHarness(async (h) => {
			h.runtime.startSession(h.sessionFile);
			const result = await h.start();
			const child = h.children[0];
			child.emit("spawn");
			writeDecision(result.details.resultPath, "Do not accept this stale approval");
			const lateClose = child.listeners("close")[0] as (code: number, signal: null) => void;
			h.runtime.state.commit(action === "abort"
				? abortWorkflowRun(h.runtime.state.getState(), "run-folio")
				: startWorkflowRun(h.runtime.state.getState(), h.input("run-replacement"), { replaceActive: true }));
			assert.deepEqual(child.kills, ["SIGTERM"]);
			assertDetached(child);
			const old = getWorkflowRunSnapshot(h.store.state, "run-folio")!;
			assert.equal(old.status, "aborted");
			assert.equal(old.gateHistory?.at(-1)?.status, "interrupted");
			assert.equal(old.gateHistory?.at(-1)?.decision, undefined);
			assert.equal(existsSync(result.details.resultPath), true);
			assert.equal(readFileSync(h.artifact, "utf8"), "# Durable folio\n");
			child.close();
			lateClose(0, null);
			child.emit("error", new Error("late old process failure"));
			assert.equal(h.pi.messages.length, 0);
			if (action === "replace") {
				const replacement = await h.start();
				writeDecision(replacement.details.resultPath, "New run decision");
				h.children[1].close();
				assert.equal(h.pi.results().length, 1);
				assert.equal(h.pi.results()[0].message.details?.runId, "run-replacement");
			}
		});
	}
});

test("state invalidation still stops the owned process when abort persistence throws after updating live state", async () => {
	await withHarness(async (h) => {
		h.runtime.startSession(h.sessionFile);
		const result = await h.start();
		h.store.fault = () => "after";
		assert.throws(
			() => h.runtime.state.commit(abortWorkflowRun(h.store.state, "run-folio")),
			/failure after live state changed/,
		);
		assert.deepEqual(h.children[0].kills, ["SIGTERM"]);
		assertDetached(h.children[0]);
		writeDecision(result.details.resultPath);
		h.children[0].close();
		assert.equal(h.pi.results().length, 0);
		assert.equal(getActiveWorkflowRun(h.store.state), null);
	});
});

test("shutdown and branch/session replacement interrupt history and restart with a fresh owner", async () => {
	for (const change of ["shutdown", "same-file-branch", "new-session"] as const) {
		await withHarness(async (h) => {
			h.runtime.startSession(h.sessionFile);
			const first = await h.start();
			const owner = h.latest().sessionId;
			const nextFile = change === "new-session" ? `${h.sessionFile}.new` : h.sessionFile;
			writeFileSync(nextFile, "{}\n");
			if (change === "shutdown") {
				h.runtime.shutdown();
				assert.equal(h.latest().status, "interrupted");
				await assert.rejects(h.start(), /current persistent parent session/);
			}
			h.runtime.startSession(nextFile);
			assert.equal(h.latest().status, "interrupted");
			assert.match(h.latest().failureReason ?? "", /chat fallback/);
			assert.deepEqual(h.children[0].kills, ["SIGTERM"]);
			assertDetached(h.children[0]);
			assert.equal(h.pi.messages.length, 0);
			if (change === "new-session") {
				await assert.rejects(h.start(), /current persistent parent session/);
			}
			const second = await h.start({}, nextFile);
			assert.notEqual(h.latest().sessionId, owner);
			assert.notEqual(second.details.attemptId, first.details.attemptId);
			assert.notEqual(second.details.resultPath, first.details.resultPath);
			writeDecision(first.details.resultPath, "Late prior owner");
			h.children[0].close();
			assert.equal(h.pi.messages.length, 0);
			writeDecision(second.details.resultPath, "Current owner");
			h.children[1].close();
			assert.equal(h.pi.results().length, 1);
			assert.equal(h.pi.results()[0].message.details?.attemptId, second.details.attemptId);
			assert.equal(h.latest().feedback, "Current owner");
			assert.equal(getActiveWorkflowRun(h.store.state)?.gateHistory?.[0].status, "interrupted");
		});
	}
});

test("pending gates reject spawn, resume, and recovery before any lifecycle data or launch mutation", async () => {
	await withHarness(async (h) => {
		h.runtime.startSession(h.sessionFile);
		await h.start();
		const before = JSON.stringify(h.store.state);
		const persisted = h.store.persisted.length;
		const forbidden = () => { throw new Error("must not reach a role dependency"); };
		const dependencies: WorkflowToolDependencies = {
			state: h.runtime.state,
			execution: {
				stopSubagent: () => { throw new Error("Unexpected child stop"); },
				launchSubagent: forbidden,
				executeSubagentResume: forbidden,
				watchInBackground: forbidden,
			},
			loadAgentDefaults: forbidden,
			isTmuxAvailable: forbidden,
			muxUnavailableResult: forbidden,
		};
		const lifecycle = createWorkflowLifecycleTools(h.pi as unknown as ExtensionAPI, dependencies);
		const params = { runId: "run-folio", role: "scribe", data: { ticket: "must not persist" } };
		const ctx = h.context() as Parameters<typeof lifecycle.spawn>[1];
		await assert.rejects(lifecycle.spawn({ ...params, task: "Do not launch" }, ctx), /gate "draft-check" is pending/);
		await assert.rejects(lifecycle.resume({ ...params, message: "Do not resume" }, ctx), /gate "draft-check" is pending/);
		await assert.rejects(lifecycle.recover({ ...params, failure: "quota exceeded" }, ctx), /gate "draft-check" is pending/);
		await assert.rejects(h.start({ data: { ticket: "second gate mutation" } }), /pending browser gate/);
		assert.equal(JSON.stringify(h.store.state), before);
		assert.equal(h.store.persisted.length, persisted);
		assert.equal(h.children.length, 1);
		assert.equal(h.pi.messages.length, 0);
	});
});

test("process failures and malformed closed results persist a failure and never imply approval", async () => {
	for (const failure of ["nonzero", "missing", "invalid-json", "invalid-decision", "missing-binary"] as const) {
		await withHarness(async (h) => {
			h.runtime.startSession(h.sessionFile);
			const result = await h.start();
			const child = h.children[0];
			if (failure === "nonzero") writeDecision(result.details.resultPath);
			if (failure === "invalid-json") writeFileSync(result.details.resultPath, "{ broken");
			if (failure === "invalid-decision") writeDecision(result.details.resultPath, "", "unknown");
			if (failure === "missing-binary") {
				child.emit("error", Object.assign(new Error("spawn plannotator ENOENT"), { code: "ENOENT" }));
				assert.equal(h.pi.results().length, 0, "error must wait for close");
			}
			child.close(failure === "nonzero" ? 1 : failure === "missing-binary" ? -2 : 0);
			assert.equal(h.latest().status, "failed");
			assert.equal(h.latest().decision, undefined);
			assert.ok(h.latest().failureReason);
			assert.equal(h.pi.results().length, 1);
			const final = h.pi.results()[0];
			assert.deepEqual(final.options, { deliverAs: "steer", triggerTurn: true });
			assert.match(final.message.content, /chat fallback.*no browser approval was accepted/);
			assert.equal(final.message.details?.decision, undefined);
			assert.equal(h.store.persisted.at(-1)?.gateHistory?.at(-1)?.status, "failed");
			assert.deepEqual(h.errors, []);
		});
	}
});

test("starting and running persistence failures stop safely without an approval or fabricated result", async () => {
	await withHarness(async (h) => {
		h.runtime.startSession(h.sessionFile);
		h.store.fault = () => "before";
		await assert.rejects(h.start({ data: { ticket: "never saved" } }), /persistence failure.*No approval was accepted/);
		assert.equal(h.children.length, 0);
		assert.equal(h.store.persisted.length, 0);
		assert.equal(getActiveWorkflowRun(h.store.state)?.data.ticket, "DOC-17");
		assert.equal(getActiveWorkflowRun(h.store.state)?.gateHistory, undefined);
		assert.equal(h.pi.messages.length, 0);
	});
	await withHarness(async (h) => {
		h.runtime.startSession(h.sessionFile);
		const result = await h.start();
		h.store.fault = () => "before";
		h.children[0].emit("spawn");
		assert.deepEqual(h.children[0].kills, ["SIGTERM"]);
		assertDetached(h.children[0]);
		assert.equal(h.latest().status, "starting");
		assert.equal(h.pi.results().length, 0);
		assert.equal(h.errors.length, 1);
		assert.equal(h.pi.messages[0].message.customType, "workflow_gate_error");
		assert.match(h.pi.messages[0].message.content, /No approval was accepted/);
		writeDecision(result.details.resultPath);
		h.children[0].close();
		assert.equal(h.pi.results().length, 0);
	});
});

test("closed success or failure is never delivered unless its final snapshot persisted", async () => {
	for (const outcome of ["completed", "failed"] as const) {
		await withHarness(async (h) => {
			h.runtime.startSession(h.sessionFile);
			const result = await h.start();
			h.children[0].emit("spawn");
			writeDecision(result.details.resultPath, "Unpersisted approval must not advance");
			h.store.fault = (transition) =>
				transition.snapshots.at(-1)?.gateHistory?.at(-1)?.status === outcome ? "before" : undefined;
			h.children[0].close(outcome === "completed" ? 0 : 1);
			assert.equal(h.latest().status, "running");
			assert.equal(h.latest().decision, undefined);
			assert.equal(h.pi.results().length, 0);
			assert.equal(h.errors.length, 1);
			assert.equal(h.pi.messages.length, 1);
			assert.equal(h.pi.messages[0].message.customType, "workflow_gate_error");
			assert.deepEqual(h.pi.messages[0].options, { deliverAs: "steer", triggerTurn: true });
			assert.match(h.pi.messages[0].message.content, /No approval was accepted.*Abort or reload/);
			assert.equal(existsSync(result.details.resultPath), true);
			h.children[0].close();
			assert.equal(h.pi.messages.length, 1);
			await assert.rejects(h.start(), /pending browser gate/);
		});
	}
});
