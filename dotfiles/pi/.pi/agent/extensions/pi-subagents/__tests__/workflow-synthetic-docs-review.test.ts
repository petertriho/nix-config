// A temporary, unbundled package tests that the lifecycle does not depend on
// the bundled workflow's role names or data slots.
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	readLaunchProfile,
} from "../execution/launch-profile.ts";
import type { WorkflowEventClient } from "../adapters/workflow-client.ts";
import { WORKFLOW_PROVIDER_DELIVERY_CHANNEL, type WorkflowProviderRequest } from "../adapters/workflow-contract.ts";
import { FakeWorkflowProviderExecution, createWorkflowEventExecutionFixture } from "./helpers/workflow-event-execution.ts";
import { until } from "./helpers/workflow.ts";
import { buildWorkflowRolloverHandoffForRole } from "../workflow/handoff.ts";
import { discoverWorkflowRegistry } from "../workflow/registry.ts";
import {
	formatWorkflowRunStatus,
	registerWorkflowCommands,
	type WorkflowCommandStateStore,
} from "../workflow/runtime.ts";
import { chooseWorkflowStartup } from "../workflow/startup.ts";
import { loadWorkflowDefinitionFromPackage } from "../workflow/schema.ts";
import {
	WORKFLOW_RUN_ENTRY_CUSTOM_TYPE,
	createWorkflowRunState,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	persistWorkflowRunSnapshots,
	recordWorkflowRunRoleSession,
	restoreWorkflowRunStateFromSession,
	type WorkflowRunBranchReader,
	type WorkflowRunPersistTarget,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "../workflow/state.ts";
import {
	createWorkflowLifecycleTools,
	type WorkflowToolDependencies,
	type WorkflowToolStateStore,
} from "../workflow/tools.ts";
import { isWorkflowRoleSkipAssignment, type NormalizedWorkflowDefinition } from "../workflow/types.ts";

const SCRIBE = {
	provider: "acme",
	id: "scribe-pro",
	name: "Scribe Pro",
	api: "openai-responses",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 8_000,
} as unknown as import("@earendil-works/pi-ai").Model<any>;

const CHECK = {
	provider: "zeta",
	id: "check-max",
	name: "Check Max",
	api: "anthropic-messages",
	reasoning: true,
	thinkingLevelMap: { high: "high" },
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 8_000,
} as unknown as import("@earendil-works/pi-ai").Model<any>;

const RELAY = {
	provider: "omega",
	id: "relay-lite",
	name: "Relay Lite",
	api: "openai-completions",
	reasoning: true,
	thinkingLevelMap: { high: "high" },
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 8_000,
} as unknown as import("@earendil-works/pi-ai").Model<any>;

const AVAILABLE_MODELS = [SCRIBE, CHECK, RELAY] as any[];

const CONFIGURE = "Configure each role before starting";
const START = "Start workflow and save these assignments";
const RECOVER_MODEL = "Select a replacement model and thinking level";

function rowFor(canonical: string): (choices: string[]) => string | undefined {
	return (choices: string[]) => choices.find((label: string) => label.startsWith(canonical));
}

const scribeRow = rowFor("acme/scribe-pro");
const checkRow = rowFor("zeta/check-max");
const relayRow = rowFor("omega/relay-lite");

function writeDocsReviewPackage(projectRoot: string): string {
	const packageDir = join(projectRoot, ".pi", "workflows", "docs-review");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		join(packageDir, "workflow.json"),
		`${JSON.stringify(
			{
				version: 1,
				id: "docs-review",
				command: {
					name: "docs",
					description: "Draft and verify documentation for a ticket",
					argumentHint: "<ticket> <request>",
				},
				skill: "SKILL.md",
				data: {
					draft: {
						kind: "file",
						label: "Draft",
						constraint: { under: ".artifacts/docs", basename: "DRAFT.md" },
					},
					report: {
						kind: "file",
						label: "Verification report",
						constraint: { under: ".artifacts/docs", basename: "REPORT.md" },
					},
					ticket: { kind: "string", label: "Ticket" },
				},
				roles: [
					{
						id: "author",
						label: "Documentation author",
						agent: "scribe",
						reads: ["ticket", "draft"],
						handoff: "Continue the durable draft from the ticket and the current document.",
					},
					{
						id: "verifier",
						label: "Documentation verifier",
						agent: "fact-checker",
						reads: ["draft", "ticket", "report"],
						handoff: "Verify the current draft independently and update only the report.",
					},
				],
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		[
			"---",
			"name: docs-review-private",
			"description: Private docs review orchestration.",
			"---",
			"",
			"# Docs review",
			"",
			"Draft, then verify. Use only dedicated workflow lifecycle tools.",
			"",
		].join("\n"),
	);
	return packageDir;
}

type DocsReviewProject = {
	root: string;
	agentDir: string;
	isolatedRoot: string;
	packageDir: string;
	definition: NormalizedWorkflowDefinition;
};

async function withDocsReviewProject(run: (project: DocsReviewProject) => Promise<void> | void): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "docs-review-project-"));
	const isolatedRoot = mkdtempSync(join(tmpdir(), "docs-review-empty-"));
	const agentDir = join(root, "agent-state");
	try {
		execFileSync("git", ["init", "-q", root]);
		execFileSync("git", ["-C", root, "config", "core.excludesFile", "/dev/null"]);
		execFileSync("git", ["-C", root, "config", "user.email", "t@t"]);
		execFileSync("git", ["-C", root, "config", "user.name", "t"]);
		writeFileSync(join(root, "README.md"), "docs project\n");
		execFileSync("git", ["-C", root, "add", "README.md"]);
		execFileSync("git", ["-C", root, "commit", "-qm", "init"]);
		const packageDir = writeDocsReviewPackage(root);
		const loaded = loadWorkflowDefinitionFromPackage(packageDir);
		assert.equal(loaded.status, "ok");
		if (loaded.status !== "ok") throw new Error("docs-review fixture failed to load");
		await run({ root, agentDir, isolatedRoot, packageDir, definition: loaded.definition });
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(isolatedRoot, { recursive: true, force: true });
	}
}

class StateStore implements WorkflowCommandStateStore, WorkflowToolStateStore {
	state: WorkflowRunState;
	readonly appended: Array<{ customType: string; data: unknown }> = [];
	private readonly target: WorkflowRunPersistTarget;

	constructor(state: WorkflowRunState) {
		this.state = state;
		this.target = {
			appendEntry: (customType, data) => {
				this.appended.push({ customType, data });
			},
		};
	}

	getState(): WorkflowRunState {
		return this.state;
	}

	commit(transition: WorkflowRunTransitionResult): void {
		this.state = transition.state;
		persistWorkflowRunSnapshots(this.target, transition.snapshots);
	}
}

class FakePi {
	readonly commands: Array<{
		name: string;
		description?: string;
		handler: (args: string, ctx: any) => Promise<void>;
		getArgumentCompletions?: (prefix: string) => unknown;
	}> = [];
	readonly messages: string[] = [];

	registerCommand(name: string, command: any): void {
		this.commands.push({ name, ...command });
	}

	getCommands(): any[] {
		return this.commands.map((command) => ({
			name: command.name,
			source: "extension",
			sourceInfo: {
				path: "/tmp/docs-review.e2e.test.ts",
				source: "test",
				scope: "temporary",
				origin: "top-level",
			},
		}));
	}

	sendUserMessage(message: string): void {
		this.messages.push(message);
	}

	command(name: string) {
		const command = this.commands.find((candidate) => candidate.name === name);
		assert.ok(command, `missing /${name}`);
		return command;
	}
}

function commandContext(input: {
	root: string;
	selections?: Array<string | undefined | ((choices: string[]) => string | undefined)>;
}) {
	const queue = [...(input.selections ?? [])];
	const selectCalls: Array<{ title: string; choices: string[] }> = [];
	const notifications: Array<[string, string]> = [];
	return {
		ctx: {
			cwd: input.root,
			hasUI: true,
			isIdle: () => true,
			isProjectTrusted: () => true,
			sessionManager: {
				getSessionFile: () => join(input.root, "parent.jsonl"),
				getSessionId: () => "parent",
				getSessionDir: () => input.root,
			},
			model: SCRIBE,
			thinkingLevel: "off",
			scopedModels: [],
			modelRegistry: { getAvailable: () => AVAILABLE_MODELS },
			ui: {
				select: async (title: string, choices: string[]) => {
					selectCalls.push({ title, choices });
					const respond = queue.shift();
					return typeof respond === "function" ? respond(choices) : respond;
				},
				notify: (message: string, level: string) => {
					notifications.push([message, level]);
				},
				confirm: async () => false,
			},
		} as any,
		notifications,
		selectCalls,
	};
}

function makeRuntime(input: {
	root: string;
	agentDir: string;
	isolatedRoot: string;
	store: StateStore;
	selections?: Array<string | undefined | ((choices: string[]) => string | undefined)>;
}) {
	const pi = new FakePi();
	const environment = commandContext({ root: input.root, selections: input.selections });
	const runtime = registerWorkflowCommands(pi as any, {
		state: input.store,
		loadAgent: (agentName) =>
			agentName === "scribe" || agentName === "fact-checker"
				? { body: `You are ${agentName}.`, autoExit: true }
				: null,
		isTmuxAvailable: () => true,
		muxSetupHint: () => "start tmux",
		createRunId: () => "run-docs-e2e",
		chooseStartup: (ctx, definition, projectRoot) =>
			chooseWorkflowStartup(ctx, definition, projectRoot, { agentDir: input.agentDir }),
		discoverRegistry: (_ctx, existingCommands) =>
			discoverWorkflowRegistry({
				bundledRoot: input.isolatedRoot,
				globalRoot: input.isolatedRoot,
				projectRoot: input.root,
				projectTrusted: true,
				existingCommands,
			}),
	});
	runtime.refreshRegistry(environment.ctx);
	return { pi, store: input.store, ...environment };
}

function toolDependencies(store: StateStore, eventExecution: WorkflowEventClient): WorkflowToolDependencies {
	return {
		state: store,
		eventExecution,
	};
}

function writeVerifierSession(input: {
	execution: FakeWorkflowProviderExecution;
	root: string;
	definition: NormalizedWorkflowDefinition;
	runId: string;
	sessionPath: string;
	data: Record<string, string>;
}): void {
	input.execution.writeSession({
		sessionPath: input.sessionPath, agentId: "fact-checker", name: "Documentation verifier",
		model: { provider: "zeta", model: "check-max", thinking: "off" },
		workflow: {
			version: 1,
			workflowId: input.definition.id,
			runId: input.runId,
			roleId: "verifier",
			manifestHash: input.definition.manifestHash,
			skillHash: input.definition.skill.hash,
			policy: "per-role",
			assignmentSource: "configured",
			projectRoot: input.root,
			originalDefault: { provider: "zeta", model: "check-max", thinking: "off" },
			currentDefault: { provider: "zeta", model: "check-max", thinking: "off" },
			data: input.data,
		},
	});
}

function branchReaderFor(store: StateStore): WorkflowRunBranchReader {
	let parentId: string | null = null;
	const branch: SessionEntry[] = store.appended.map((entry, index) => {
		const id = `entry-${index + 1}`;
		const customEntry: SessionEntry = {
			type: "custom",
			id,
			parentId,
			timestamp: new Date(Date.UTC(2026, 8, 1, 12, 0, index)).toISOString(),
			customType: entry.customType,
			data: entry.data,
		};
		parentId = id;
		return customEntry;
	});
	return { getBranch: () => branch };
}

function assertCorrelatedResult(
	fixture: ReturnType<typeof createWorkflowEventExecutionFixture>,
	request: WorkflowProviderRequest,
	sessionPath: string,
	message: string,
	successfulResponse?: boolean,
): void {
	const delivery = fixture.deliveries.find((candidate) =>
		candidate.kind === "result" && candidate.requestId === request.requestId && candidate.result.message === message);
	assert.ok(delivery && delivery.kind === "result", "the real provider must deliver the requested terminal result");
	assert.equal(delivery.providerId, fixture.client.provider.providerId);
	assert.equal(delivery.instanceId, fixture.client.provider.instanceId);
	assert.deepEqual(delivery.owner, request.owner);
	assert.deepEqual(delivery.result, {
		sessionPath, status: "completed", message, ...(successfulResponse ? { successfulResponse: true } : {}),
	});
}

async function savedVerifierEventFixture(project: DocsReviewProject) {
	const store = new StateStore(createWorkflowRunState());
	const started = makeRuntime({
		...project, store, selections: [CONFIGURE, scribeRow, "off", checkRow, "off", START],
	});
	await started.pi.command("docs").handler("DOC-42 Verify the deployment guide.", started.ctx);
	const runId = "run-docs-e2e";
	const execution = new FakeWorkflowProviderExecution(project.root, {
		scribe: "You are scribe.", "fact-checker": "You are fact-checker.",
	});
	const sessionPath = join(project.root, "verifier-1.jsonl");
	writeVerifierSession({ execution, ...project, runId, sessionPath, data: {} });
	store.commit(recordWorkflowRunRoleSession(store.getState(), runId, "verifier", sessionPath, { launchStatus: "completed" }));
	const messages: any[] = [];
	const pi = { sendMessage(message: any) { messages.push(message); } };
	const toolUi = commandContext({ root: project.root, selections: [RECOVER_MODEL, relayRow, "high"] });
	const fixture = createWorkflowEventExecutionFixture(execution, toolUi.ctx, pi);
	const lifecycle = createWorkflowLifecycleTools(pi as any, toolDependencies(store, fixture.client));
	return { store, execution, sessionPath, messages, toolUi, fixture, lifecycle, runId };
}

test("synthetic docs-review runs discovery, alias generation, startup order, and private-skill startup end-to-end", async () => {
	await withDocsReviewProject(async (project) => {
		const registry = discoverWorkflowRegistry({
			bundledRoot: project.isolatedRoot,
			globalRoot: project.isolatedRoot,
			projectRoot: project.root,
			projectTrusted: true,
			existingCommands: [],
		});
		assert.deepEqual(registry.workflows.map((entry) => entry.id), ["docs-review"]);
		assert.deepEqual(registry.diagnostics, []);
		const entry = registry.workflowById["docs-review"]!;
		assert.equal(entry.source, "project");
		assert.equal(entry.alias.name, "docs");
		assert.equal(entry.alias.status, "available");
		assert.equal(registry.aliases.docs, "docs-review");
		assert.equal(entry.packagePath, project.packageDir);
		assert.match(entry.skillPath, /\.pi[/\\]workflows[/\\]docs-review[/\\]SKILL\.md$/);

		const untrusted = discoverWorkflowRegistry({
			bundledRoot: project.isolatedRoot,
			globalRoot: project.isolatedRoot,
			projectRoot: project.root,
			projectTrusted: false,
			existingCommands: [],
		});
		assert.deepEqual(untrusted.workflows, []);

		const store = new StateStore(createWorkflowRunState());
		const generic = makeRuntime({
			root: project.root,
			agentDir: join(project.root, "agent-state-a"),
			isolatedRoot: project.isolatedRoot,
			store,
			selections: [CONFIGURE, scribeRow, "off", checkRow, "off", START],
		});
		assert.deepEqual(
			generic.pi.commands.map((command) => command.name).sort(),
			["docs", "workflow", "workflow-resume", "workflows"],
		);
		assert.match(generic.pi.command("docs").description ?? "", /Draft and verify documentation/);
		assert.deepEqual(
			generic.pi.command("workflow").getArgumentCompletions?.("run doc"),
			[{ value: "run docs-review ", label: "docs-review", description: "Draft and verify documentation for a ticket" }],
		);

		const request = "DOC-42 Write the deployment guide for the new cache.";
		await generic.pi.command("workflow").handler(`run docs-review ${request}`, generic.ctx);
		const modelTitles = generic.selectCalls
			.filter((call) => call.title.startsWith("Model for "))
			.map((call) => call.title);
		assert.deepEqual(modelTitles, [
			"Model for Documentation author (1 of 2)",
			"Model for Documentation verifier (2 of 2)",
		]);
		assert.equal(generic.pi.messages.length, 1);

		const active = getActiveWorkflowRun(store.getState());
		assert.ok(active);
		assert.equal(active.workflowId, "docs-review");
		assert.equal(active.runId, "run-docs-e2e");
		assert.equal(active.source, "project");
		assert.equal(active.policy, "per-role");
		assert.equal(active.assignmentSource, "configured");
		assert.deepEqual(active.originalAssignments, {
			author: { provider: "acme", model: "scribe-pro", thinking: "off" },
			verifier: { provider: "zeta", model: "check-max", thinking: "off" },
		});

		const message = generic.pi.messages[0]!;
		assert.match(message, /^<skill name="docs-review-private" location="[^"]*SKILL\.md">/);
		const config = message.slice(message.indexOf("<workflow-config"));
		assert.match(config, /- id: "docs-review"/);
		assert.match(config, /- runId: "run-docs-e2e"/);
		assert.match(config, /id="author"[\s\S]*?agent="scribe"[\s\S]*?id="verifier"[\s\S]*?agent="fact-checker"/);
		assert.match(config, /id="draft" kind=file label="Draft"/);
		assert.match(config, /id="report" kind=file label="Verification report"/);
		assert.match(config, /id="ticket" kind=string label="Ticket"/);
		assert.match(config, /workflow_complete: MUST be called exactly once with runId="run-docs-e2e"/);
		assert.equal(message.endsWith(request), true);
		assert.doesNotMatch(config, /planner|task-writer|executor|reviewer/);

		const aliasStore = new StateStore(createWorkflowRunState());
		const alias = makeRuntime({
			root: project.root,
			agentDir: join(project.root, "agent-state-b"),
			isolatedRoot: project.isolatedRoot,
			store: aliasStore,
			selections: [CONFIGURE, scribeRow, "off", checkRow, "off", START],
		});
		await alias.pi.command("docs").handler(request, alias.ctx);
		assert.equal(alias.pi.messages.length, 1);
		assert.equal(alias.pi.messages[0], generic.pi.messages[0]);
		const aliasActive = getActiveWorkflowRun(aliasStore.getState());
		assert.ok(aliasActive);
		assert.deepEqual(
			{ ...aliasActive, startedAt: active.startedAt, updatedAt: active.updatedAt },
			active,
		);
	});
});

test("synthetic docs-review event lifecycle covers spawn, boundaries, resume, replacement, handoff, recovery, completion, and reload", async (t) => {
	await withDocsReviewProject(async (project) => {
		const store = new StateStore(createWorkflowRunState());
		const started = makeRuntime({
			root: project.root,
			agentDir: project.agentDir,
			isolatedRoot: project.isolatedRoot,
			store,
			selections: [CONFIGURE, scribeRow, "off", checkRow, "off", START],
		});
		const request = "DOC-42 Write the deployment guide for the new cache.";
		await started.pi.command("docs").handler(request, started.ctx);
		const runId = "run-docs-e2e";

		const execution = new FakeWorkflowProviderExecution(project.root, {
			scribe: "You are scribe.", "fact-checker": "You are fact-checker.",
		});
		const messages: Array<{ message: any; options: any }> = [];
		const pi = { sendMessage(message: any, options: any) { messages.push({ message, options }); } };
		const toolUi = commandContext({ root: project.root, selections: [RECOVER_MODEL, relayRow, "high"] });
		const fixture = createWorkflowEventExecutionFixture(execution, toolUi.ctx, pi);
		t.after(() => fixture.dispose());
		const lifecycle = createWorkflowLifecycleTools(
			pi as any,
			toolDependencies(store, fixture.client),
		);
		assert.equal(Object.hasOwn(toolDependencies(store, fixture.client), "execution"), false, "no direct execution fallback");

		execution.nextSessionPath = join(project.root, "author-1.jsonl");
		const draftPath = join(project.root, ".artifacts", "docs", "DRAFT.md");
		await assert.rejects(
			() => lifecycle.spawn({ runId, role: "author", task: "Invalid output", data: {
				draft: join(project.root, "src", "DRAFT.md"),
			} }, toolUi.ctx),
			/under|constraint/i,
		);
		assert.equal(Boolean(execution.launch), false, "invalid typed data must not reach the provider service");
		const spawnResult = await lifecycle.spawn(
			{
				runId,
				role: "author",
				task: "Draft the deployment guide.",
				data: { ticket: "DOC-42", draft: draftPath },
			},
			toolUi.ctx,
		);
		assert.equal(spawnResult.details.status, "started");
		assert.equal(execution.launch?.params.agent, "scribe");
		assert.equal(execution.launch?.params.name, "Documentation author");
		assert.deepEqual(execution.launch?.options.resolvedModel?.selection, {
			provider: "acme",
			model: "scribe-pro",
			thinking: "off",
		});
		assert.equal(execution.launch?.options.resolvedModel?.model, SCRIBE, "the provider passes the canonical registry model");
		assert.equal(execution.launch?.options.workflow?.workflowId, "docs-review");
		assert.equal(execution.launch?.options.workflow?.roleId, "author");
		assert.equal(execution.launch?.options.workflow?.data?.ticket, "DOC-42");
		assert.equal(execution.launch?.options.workflow?.data?.draft, draftPath);

		mkdirSync(join(project.root, "src"), { recursive: true });
		writeFileSync(join(project.root, "src", "guide.ts"), "export const guide = true;\n");
		mkdirSync(dirname(draftPath), { recursive: true });
		writeFileSync(draftPath, "# Deployment guide\n");
		const reportPath = join(project.root, ".artifacts", "docs", "REPORT.md");
		writeFileSync(reportPath, "premature verification\n");

		const launchRequest = fixture.requests.find((request) => request.operation === "launch")!;
		assert.ok(launchRequest);
		// The client must reject stale request, owner, provider incarnation and session evidence.
		for (const mismatch of [
			{ requestId: "stale-request" },
			{ owner: { ...launchRequest.owner, ownershipId: "stale-owner" } },
			{ instanceId: "stale-provider" },
			{ result: { sessionPath: join(project.root, "unowned.jsonl"), status: "completed", message: "forged" } },
		]) {
			fixture.events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
				...launchRequest, kind: "result",
				result: { sessionPath: execution.nextSessionPath, status: "completed", message: "forged" },
				...mismatch,
			});
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(getActiveWorkflowRun(store.getState())?.activeLaunch?.status, "running");
		assert.equal(messages.length, 0, "uncorrelated evidence cannot deliver a parent result");
		execution.watch!.running.surfaceClosed = true;
		execution.watch!.resolve({
			name: "Documentation author",
			task: "Draft the deployment guide.",
			summary: "Draft complete.",
			sessionFile: execution.nextSessionPath,
			exitCode: 0,
			elapsed: 3,
			responded: true,
		});
		await until(() => messages.length === 1);
		assert.match(messages[0]!.message.content, /Draft complete/);
		assert.deepEqual(messages[0]!.options, { triggerTurn: true, deliverAs: "steer" });
		assert.equal(messages[0]!.message.customType, "subagent_result");
		assert.equal(messages[0]!.message.details.workflow.workflowId, "docs-review");
		assert.equal(messages[0]!.message.details.workflow.roleId, "author");
		assertCorrelatedResult(fixture, launchRequest, execution.nextSessionPath, "Draft complete.");
		assert.equal(getActiveWorkflowRun(store.getState())?.activeLaunch?.status, "completed");
		assert.equal(
			existsSync(reportPath),
			true,
			"workflow completion must not change repository files",
		);

		const verifierSession = join(project.root, "verifier-1.jsonl");
		writeVerifierSession({
			execution,
			root: project.root,
			definition: project.definition,
			runId,
			sessionPath: verifierSession,
			data: { ticket: "DOC-42", draft: draftPath },
		});
		store.commit(
			recordWorkflowRunRoleSession(store.getState(), runId, "verifier", verifierSession, {
				launchStatus: "completed",
			}),
		);
		await lifecycle.resume(
			{
				runId,
				role: "verifier",
				message: "Check the deployment steps against the ticket.",
				data: { ticket: "DOC-43", report: reportPath },
				model: "previous",
			},
			toolUi.ctx,
		);
		assert.equal(execution.resume?.params.sessionPath, verifierSession);
		assert.equal(execution.resume?.params.model, "previous");
		assert.deepEqual(execution.resume?.selection, { provider: "zeta", model: "check-max", thinking: "off" });
		assert.equal(execution.resume?.lifecycle?.workflowMetadata?.data?.ticket, "DOC-43");
		assert.match(
			execution.resume?.lifecycle?.rolloverMessage ?? "",
			/Verify the current draft independently and update only the report/,
		);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Draft:/);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Ticket: DOC-43/);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Verification report:/);
		assert.doesNotMatch(
			buildWorkflowRolloverHandoffForRole({
				definition: project.definition,
				roleId: "author",
				data: { ticket: "DOC-42", draft: draftPath, report: reportPath },
			}),
			/Verification report/,
		);
		let active = getActiveWorkflowRun(store.getState());
		assert.equal(active?.roleSessions.verifier?.current, verifierSession);
		assert.deepEqual(active?.roleSessions.verifier?.history, []);

		// The fake resume retains a child until explicitly stopped.
		const stoppedResume = execution.resume!;
		await lifecycle.stopOwnedRoles();
		const replacement = join(project.root, "verifier-2.jsonl");
		execution.replacementSessionPath = replacement;
		const rollover = await lifecycle.resume(
			{
				runId,
				role: "verifier",
				message: "Start fresh if the context gate recommends it.",
			},
			toolUi.ctx,
		);
		active = getActiveWorkflowRun(store.getState());
		assert.equal(rollover.details.rollover, "fresh");
		assert.equal(active?.roleSessions.verifier?.current, replacement);
		assert.deepEqual(active?.roleSessions.verifier?.history, [verifierSession]);
		const originalSidecar = readLaunchProfile(verifierSession);
		const replacementSidecar = readLaunchProfile(replacement);
		assert.equal(originalSidecar.status, "ok");
		assert.equal(replacementSidecar.status, "ok");
		if (originalSidecar.status === "ok" && replacementSidecar.status === "ok") {
			assert.equal(originalSidecar.profile.lineage?.rolledOverTo, replacement);
			assert.equal(replacementSidecar.profile.lineage?.rolledOverFrom, verifierSession);
			assert.equal(replacementSidecar.profile.workflow?.data?.ticket, "DOC-43");
		}
		const savedBeforeStaleCallbacks = structuredClone(store.state);
		const deliveryCount = fixture.deliveries.length;
		await stoppedResume.lifecycle.onResult?.({
			result: { name: "Documentation verifier", task: "Old resume", summary: "Late result", exitCode: 0, elapsed: 0 },
			replacement: false, originalSessionPath: verifierSession, sessionPath: verifierSession,
		});
		await stoppedResume.lifecycle.onError?.({
			message: "Late error", replacement: false, originalSessionPath: verifierSession, sessionPath: verifierSession,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.deepEqual(store.state, savedBeforeStaleCallbacks, "stopped execution callbacks cannot mutate a later role launch");
		assert.equal(fixture.deliveries.length, deliveryCount, "the provider suppresses revoked result and error callbacks");
		assert.equal(messages.length, 1);

		await lifecycle.stopOwnedRoles();
		execution.replacementSessionPath = undefined;
		await assert.rejects(
			() => lifecycle.recover({ runId, role: "verifier", failure: "The draft contains a typo" }, toolUi.ctx),
			/not eligible/i,
		);
		assert.equal(toolUi.selectCalls.length, 0, "non-provider failures do not open a recovery picker");
		const recovered = await lifecycle.recover(
			{
				runId,
				role: "verifier",
				failure: "Provider quota exhausted; purchase more credits",
				message: "Recheck the cache invalidation steps.",
			},
			toolUi.ctx,
		);
		assert.equal(recovered.details.status, "started");
		assert.equal(toolUi.selectCalls[0]?.title, "Recover the Documentation verifier role?");
		assert.equal(toolUi.selectCalls[1]?.title, "Select subagent model");
		assert.equal(toolUi.selectCalls[2]?.title, "Thinking for Documentation verifier — omega/relay-lite");
		assert.match(execution.resume?.recovery?.failure.message ?? "", /Provider quota exhausted/);
		assert.equal(execution.resume?.recovery?.failure.kind, "usage");
		assert.equal(execution.resume?.params.model, "omega/relay-lite:high");
		assert.deepEqual(execution.resume?.selection, { provider: "omega", model: "relay-lite", thinking: "high" });
		assert.match(
			execution.resume?.params.message ?? "",
			/Verify the current draft independently and update only the report/,
		);

		const originalAssignment = { provider: "zeta", model: "check-max", thinking: "off" };
		assert.deepEqual(getActiveWorkflowRun(store.getState())?.currentAssignments?.verifier, originalAssignment,
			"acknowledging the replacement model alone cannot promote recovery");
		await execution.successfulResponse();
		assert.deepEqual(getActiveWorkflowRun(store.getState())?.currentAssignments?.verifier, originalAssignment,
			"a successful response callback alone cannot promote recovery before a correlated terminal result");
		const recoveryRequest = [...fixture.requests].reverse().find((request) => request.operation === "recover")!;
		await execution.completeResume({
			name: "Documentation verifier", task: "Recheck the cache invalidation steps.", summary: "Verification complete.",
			sessionFile: replacement, exitCode: 0, elapsed: 3, responded: true,
		});
		await until(() => messages.length === 2);
		assertCorrelatedResult(fixture, recoveryRequest, replacement, "Verification complete.", true);
		active = getActiveWorkflowRun(store.getState());
		assert.deepEqual(active?.originalAssignments?.verifier, {
			provider: "zeta",
			model: "check-max",
			thinking: "off",
		});
		assert.deepEqual(active?.currentAssignments?.verifier, {
			provider: "omega",
			model: "relay-lite",
			thinking: "high",
		});
		const sidecar = readLaunchProfile(replacement);
		assert.equal(sidecar.status, "ok");
		if (sidecar.status === "ok") {
			assert.equal(sidecar.profile.workflow?.assignmentSource, "recovery");
			assert.equal(sidecar.profile.workflow?.currentDefault?.model, "relay-lite");
			assert.deepEqual(sidecar.profile.workflow?.originalDefault, originalAssignment);
			assert.deepEqual(sidecar.profile.runtime.lastModel, active?.currentAssignments?.verifier);
		}

		store.commit(
			recordWorkflowRunRoleSession(store.getState(), runId, "verifier", replacement, {
				launchStatus: "running",
			}),
		);
		assert.ok(store.appended.length >= 6);
		assert.ok(
			store.appended.every((entry) => entry.customType === WORKFLOW_RUN_ENTRY_CUSTOM_TYPE),
		);
		const restored = restoreWorkflowRunStateFromSession(branchReaderFor(store));
		const restoredActive = getActiveWorkflowRun(restored.state);
		assert.ok(restoredActive);
		assert.equal(restoredActive.runId, runId);
		assert.equal(restoredActive.workflowId, "docs-review");
		assert.equal(restoredActive.data.ticket, "DOC-43");
		assert.equal(restoredActive.data.report, reportPath);
		assert.equal(restoredActive.roleSessions.verifier?.current, replacement);
		assert.deepEqual(restoredActive.roleSessions.verifier?.history, [verifierSession]);
		assert.deepEqual(restoredActive.originalAssignments, active?.originalAssignments);
		const restoredVerifier = restoredActive.currentAssignments?.verifier;
		assert.ok(restoredVerifier && !isWorkflowRoleSkipAssignment(restoredVerifier));
		assert.equal(restoredVerifier.model, "relay-lite");
		assert.equal(restoredActive.activeLaunch?.status, "interrupted");
		assert.equal(restoredActive.activeLaunch?.roleId, "verifier");
		const status = formatWorkflowRunStatus(restoredActive);
		assert.match(status, /interrupted/);
		assert.match(status, /Documentation verifier \(verifier\)/);
		assert.match(status, /Review detached repository changes manually/);

		// Package drift must not change the definition in a persisted run.
		writeFileSync(
			join(project.packageDir, "workflow.json"),
			`${JSON.stringify(
				{
					...JSON.parse(
						readFileSync(join(project.packageDir, "workflow.json"), "utf8"),
					),
					roles: [],
				},
				null,
				2,
			)}\n`,
		);
		const afterDrift = restoreWorkflowRunStateFromSession(branchReaderFor(store));
		const driftedActive = getActiveWorkflowRun(afterDrift.state);
		assert.ok(driftedActive);
		assert.deepEqual(driftedActive.definition.roleIds, ["author", "verifier"]);

		const completed = await lifecycle.complete({
			runId,
			status: "completed",
			summary: "Guide drafted and verified.",
		});
		assert.match(completed.content[0]!.text, /Guide drafted and verified/);
		assert.equal(getActiveWorkflowRun(store.getState()), null);
		await assert.rejects(
			() => lifecycle.spawn({ runId, role: "author", task: "Late call" }, toolUi.ctx),
			/stale|completed/i,
		);
		await assert.rejects(() => lifecycle.resume({ runId, role: "verifier" }, toolUi.ctx), /stale|completed/i);
		await assert.rejects(() => lifecycle.recover({
			runId, role: "verifier", failure: "Provider quota exhausted",
		}, toolUi.ctx), /stale|completed/i);
		assert.deepEqual(execution.stopped, [verifierSession, replacement]);
		const finalRestore = restoreWorkflowRunStateFromSession(branchReaderFor(store));
		assert.equal(getActiveWorkflowRun(finalRestore.state), null);
		assert.equal(getWorkflowRunSnapshot(finalRestore.state, runId)?.status, "completed");
		assert.equal(
			getWorkflowRunSnapshot(finalRestore.state, runId)?.roleSessions.verifier?.current,
			replacement,
		);
	});
});

for (const missing of ["from", "to"] as const) {
	test(`synthetic docs-review rejects rollover with a missing rolledOver${missing === "from" ? "From" : "To"} link`, async (t) => {
		await withDocsReviewProject(async (project) => {
			const f = await savedVerifierEventFixture(project);
			t.after(() => f.fixture.dispose());
			const replacement = join(project.root, "verifier-2.jsonl");
			f.execution.replacementSessionPath = replacement;
			f.execution.omitLineage = missing;
			await assert.rejects(
				() => f.lifecycle.resume({ runId: f.runId, role: "verifier" }, f.toolUi.ctx),
				/rollover lineage not confirmed/i,
			);
			const active = getActiveWorkflowRun(f.store.getState());
			assert.equal(active?.roleSessions.verifier?.current, f.sessionPath);
			assert.deepEqual(active?.roleSessions.verifier?.history, []);
			assert.equal(active?.activeLaunch?.status, "failed");
			assert.deepEqual(f.execution.stopped, [replacement], "unconfirmed rollover requires cleanup");
			await f.execution.completeResume({
				name: "Documentation verifier", task: "Late rollover", summary: "Must not deliver",
				exitCode: 0, elapsed: 0,
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
			assert.equal(f.messages.length, 0, "an unconfirmed launch cannot deliver a correlated result");
			assert.equal(f.fixture.deliveries.length, 0);
		});
	});
}

for (const evidence of ["absent", "different-model"] as const) {
	test(`synthetic docs-review recovery retains its default when successful-response evidence is ${evidence}`, async (t) => {
		await withDocsReviewProject(async (project) => {
			const f = await savedVerifierEventFixture(project);
			t.after(() => f.fixture.dispose());
			await f.lifecycle.recover({
				runId: f.runId, role: "verifier", failure: "Provider quota exhausted; purchase more credits",
			}, f.toolUi.ctx);
			assert.equal(f.execution.resume?.params.model, "omega/relay-lite:high");
			if (evidence === "different-model") {
				await f.execution.successfulResponse({ provider: "acme", model: "scribe-pro", thinking: "off" });
			}
			const request = f.fixture.requests.find((request) => request.operation === "recover")!;
			await f.execution.completeResume({
				name: "Documentation verifier", task: "Recover", summary: "Completed without matching response evidence",
				sessionFile: f.sessionPath, exitCode: 0, elapsed: 0,
			});
			await until(() => f.messages.length === 1);
			assertCorrelatedResult(f.fixture, request, f.sessionPath, "Completed without matching response evidence");
			const active = getActiveWorkflowRun(f.store.getState());
			assert.equal(active?.activeLaunch?.status, "completed");
			assert.deepEqual(active?.currentAssignments?.verifier, { provider: "zeta", model: "check-max", thinking: "off" });
			assert.deepEqual(active?.currentAssignments, active?.originalAssignments,
				"a completed result without matching successful response evidence cannot promote the selected recovery model");
		});
	});
}
