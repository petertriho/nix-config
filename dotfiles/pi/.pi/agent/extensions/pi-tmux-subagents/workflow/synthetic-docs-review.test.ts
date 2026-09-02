/**
 * T12 generality proof: a synthetic, non-Pter workflow runs the entire generic
 * subsystem end-to-end.
 *
 * The `docs-review` package below exists only inside temp directories created
 * by these tests. It is never bundled or shipped. It deliberately differs from
 * Pter in every authoring dimension:
 *
 * - workflow id `docs-review` with a distinct command alias `docs`;
 * - two roles (`author`, `verifier`) instead of four;
 * - data slots `draft`, `report` (file) and `ticket` (string);
 * - a different read set, a different write policy (author keeps `worktree`
 *   plus its own draft file; verifier writes only the report);
 * - unrelated handoff text and agents (`scribe`, `fact-checker`).
 *
 * The full lifecycle below — discovery, command generation, startup model
 * order, spawn, resume, role-session replacement, persistence, write
 * boundaries, rollover handoff, recovery, completion, and reload restoration
 * — runs without any TypeScript branch for these IDs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	fingerprintStrings,
	readLaunchProfile,
	writeLaunchProfile,
	type LaunchProfileWorkflowMetadata,
} from "../launch-profile.ts";
import type {
	BackgroundWatchOptions,
	ResumeLifecycleContext,
	ResumeRecoveryContext,
	RunningSubagent,
	SubagentLaunchParams,
	SubagentResumeParams,
} from "../subagent-services.ts";
import { createStatusState } from "../status.ts";
import { buildWorkflowRolloverHandoffForRole } from "./handoff.ts";
import { discoverWorkflowRegistry } from "./registry.ts";
import {
	formatWorkflowRunStatus,
	registerWorkflowCommands,
	type WorkflowCommandStateStore,
} from "./runtime.ts";
import { chooseWorkflowStartup } from "./startup.ts";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
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
} from "./state.ts";
import {
	createWorkflowLifecycleTools,
	type WorkflowSubagentExecution,
	type WorkflowToolDependencies,
	type WorkflowToolStateStore,
} from "./tools.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";
import {
	describeWorkflowWriteBoundaryReport,
	evaluateWorkflowWriteBoundarySnapshot,
	type WorkflowWriteBoundarySnapshot,
} from "./write-policy.ts";

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
						writes: ["worktree", "file:draft"],
						handoff: "Continue the durable draft from the ticket and the current document.",
					},
					{
						id: "verifier",
						label: "Documentation verifier",
						agent: "fact-checker",
						reads: ["draft", "ticket", "report"],
						writes: ["file:report"],
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

async function withDocsReviewProject(
	run: (project: {
		root: string;
		agentDir: string;
		isolatedRoot: string;
		packageDir: string;
		definition: NormalizedWorkflowDefinition;
	}) => Promise<void> | void,
): Promise<void> {
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

class FakeExecution implements WorkflowSubagentExecution {
	launch?: {
		params: SubagentLaunchParams;
		options: {
			workflow?: LaunchProfileWorkflowMetadata;
			resolvedModel?: { selection: { provider: string; model: string; thinking?: string } };
		};
	};
	watch?: BackgroundWatchOptions;
	resume?: {
		params: SubagentResumeParams;
		recovery?: ResumeRecoveryContext;
		lifecycle?: ResumeLifecycleContext;
	};
	replacementSessionPath?: string;
	nextSessionPath = "/tmp/docs-review-child.jsonl";

	async launchSubagent(
		params: SubagentLaunchParams,
		_ctx: any,
		options: any = {},
	): Promise<RunningSubagent> {
		this.launch = { params, options };
		return {
			id: "docs-child-1",
			name: params.name,
			task: params.task,
			agent: params.agent,
			surface: "%1",
			startTime: 0,
			sessionFile: this.nextSessionPath,
			launchScriptFile: "/tmp/launch.sh",
			statusState: createStatusState({ source: "pi", startTimeMs: 0 }),
			interactive: false,
		};
	}

	watchInBackground(options: BackgroundWatchOptions): AbortController {
		this.watch = options;
		return new AbortController();
	}

	async executeSubagentResume(
		_pi: any,
		params: SubagentResumeParams,
		_ctx: any,
		recovery?: ResumeRecoveryContext,
		lifecycle?: ResumeLifecycleContext,
	) {
		this.resume = { params, recovery, lifecycle };
		const sessionPath = this.replacementSessionPath ?? params.sessionPath;
		await lifecycle?.onLaunched?.({
			running: {
				id: "docs-resume-1",
				name: params.name ?? "Resume",
				task: params.message ?? "resumed session",
				surface: "%2",
				startTime: 0,
				sessionFile: sessionPath,
				statusState: createStatusState({ source: "pi", startTimeMs: 0 }),
				interactive: false,
			},
			replacement: Boolean(this.replacementSessionPath),
			originalSessionPath: params.sessionPath,
			sessionPath,
		});
		return {
			content: [{ type: "text" as const, text: "resume started" }],
			details: {
				status: "started",
				sessionPath,
				...(this.replacementSessionPath
					? {
						rollover: "fresh",
						replacementSessionPath: this.replacementSessionPath,
					}
					: {}),
			},
		};
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

function toolDependencies(store: StateStore, execution: FakeExecution): WorkflowToolDependencies {
	return {
		state: store,
		execution,
		loadAgentDefaults: (agentName) =>
			agentName === "scribe" || agentName === "fact-checker"
				? { body: `You are ${agentName}.`, autoExit: true }
				: null,
		isTmuxAvailable: () => true,
		muxUnavailableResult: () => ({
			content: [{ type: "text", text: "tmux unavailable" }],
			details: { error: "tmux not available" },
		}),
	};
}

function writeVerifierSession(input: {
	root: string;
	definition: NormalizedWorkflowDefinition;
	runId: string;
	sessionPath: string;
	data: Record<string, string>;
}): void {
	mkdirSync(dirname(input.sessionPath), { recursive: true });
	writeFileSync(input.sessionPath, "{}\n");
	writeLaunchProfile(input.sessionPath, {
		version: 1,
		stable: {
			agentName: "fact-checker",
			displayName: "Documentation verifier",
			roleBody: "You are fact-checker.",
			roleBodyHash: "b".repeat(64),
			systemPromptMode: "append",
			cwd: input.root,
			agentDir: input.root,
			controls: {
				denyTools: [],
				autoExit: true,
				interactive: false,
				sessionMode: "standalone",
			},
			originalSessionPath: input.sessionPath,
			createdAt: "2026-09-01T12:00:00.000Z",
		},
		runtime: {
			originalModel: { provider: "zeta", model: "check-max", thinking: "off" },
			lastModel: { provider: "zeta", model: "check-max", thinking: "off" },
			resumeCount: 0,
		},
		resources: {
			tools: fingerprintStrings([]),
			visibleSkills: fingerprintStrings([]),
			updatedAt: "2026-09-01T12:00:00.000Z",
		},
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

test("synthetic docs-review runs discovery, alias generation, startup order, and private-skill startup end-to-end", async () => {
	await withDocsReviewProject(async (project) => {
		// 1. Discovery: trusted project scope only; no bundled Pter presence.
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

		// Untrusted projects never see the package.
		const untrusted = discoverWorkflowRegistry({
			bundledRoot: project.isolatedRoot,
			globalRoot: project.isolatedRoot,
			projectRoot: project.root,
			projectTrusted: false,
			existingCommands: [],
		});
		assert.deepEqual(untrusted.workflows, []);

		// 2. Command generation: /workflow, /workflows, /workflow-resume plus
		//    the manifest alias /docs, with registry-driven completions.
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

		// 3. Startup model order follows the manifest role order (author, then
		//    verifier) through the real startup gate inside the command flow.
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
		// Zero TypeScript branches for these IDs: the startup contract is
		// entirely manifest-driven and shares nothing with Pter's roles.
		assert.doesNotMatch(config, /planner|task-writer|executor|reviewer/);

		// 4. The generated alias /docs produces the same startup behavior as
		//    /workflow run docs-review, including an identical private-skill
		//    message.
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

test("synthetic docs-review lifecycle covers spawn, boundaries, resume, replacement, handoff, recovery, completion, and reload", async () => {
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

		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			toolDependencies(store, execution),
		);
		const toolUi = commandContext({ root: project.root, selections: [RECOVER_MODEL] });

		// ── Spawn: manifest agent, label, per-role model, typed data, boundary ──
		execution.nextSessionPath = join(project.root, "author-1.jsonl");
		const draftPath = join(project.root, ".artifacts", "docs", "DRAFT.md");
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
		assert.equal(execution.launch?.options.workflow?.workflowId, "docs-review");
		assert.equal(execution.launch?.options.workflow?.roleId, "author");
		assert.equal(execution.launch?.options.workflow?.data?.ticket, "DOC-42");
		assert.equal(execution.launch?.options.workflow?.data?.draft, draftPath);

		// ── Write boundary: allowed worktree + draft changes, then a
		//    protected-file violation with exact paths and no reverts ──
		const authorBoundary = execution.watch?.running.boundary as WorkflowWriteBoundarySnapshot | undefined;
		assert.ok(authorBoundary);
		assert.equal(authorBoundary.workflowId, "docs-review");
		assert.equal(authorBoundary.roleId, "author");
		mkdirSync(join(project.root, "src"), { recursive: true });
		writeFileSync(join(project.root, "src", "guide.ts"), "export const guide = true;\n");
		mkdirSync(dirname(draftPath), { recursive: true });
		writeFileSync(draftPath, "# Deployment guide\n");
		let report = evaluateWorkflowWriteBoundarySnapshot(authorBoundary);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual([...report.allowedPaths].sort(), [".artifacts/docs/DRAFT.md", "src/guide.ts"]);
		assert.deepEqual(report.unexpectedPaths, []);

		const reportPath = join(project.root, ".artifacts", "docs", "REPORT.md");
		writeFileSync(reportPath, "premature verification\n");
		report = evaluateWorkflowWriteBoundarySnapshot(authorBoundary);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, [".artifacts/docs/REPORT.md"]);
		const outcome = describeWorkflowWriteBoundaryReport(report);
		assert.match(outcome.violationText ?? "", /workflow "docs-review" role Documentation author \(author\)/);
		assert.equal(
			(outcome.details.workflowWriteBoundary as Record<string, unknown>).roleId,
			"author",
		);

		// Violations are preserved and delivered through the same
		// asynchronous result flow, marking the launch failed.
		const asyncResult = await execution.watch!.onSuccess({
			result: {
				name: "Documentation author",
				task: "Draft the deployment guide.",
				summary: "Draft complete.",
				sessionFile: execution.nextSessionPath,
				exitCode: 0,
				elapsed: 3,
				responded: true,
			},
			boundary: outcome,
		});
		assert.match(asyncResult.content, /WORKFLOW WRITE POLICY VIOLATION/);
		assert.deepEqual(
			(asyncResult.details.workflowWriteBoundary as Record<string, unknown>).unexpectedPaths,
			[".artifacts/docs/REPORT.md"],
		);
		assert.equal(getActiveWorkflowRun(store.getState())?.activeLaunch?.status, "failed");
		assert.equal(
			existsSync(reportPath),
			true,
			"the violating change must be preserved exactly as written",
		);

		// ── Resume: current role session resolved from parent state, handoff
		//    built from manifest reads, fresh replacement keeps history ──
		const verifierSession = join(project.root, "verifier-1.jsonl");
		writeVerifierSession({
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
		assert.equal(execution.resume?.lifecycle?.workflowMetadata?.data?.ticket, "DOC-43");
		assert.match(
			execution.resume?.lifecycle?.rolloverMessage ?? "",
			/Verify the current draft independently and update only the report/,
		);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Draft:/);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Ticket: DOC-43/);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Verification report:/);
		// Slots outside the role's reads never leak into handoffs.
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

		const replacement = join(project.root, "verifier-2.jsonl");
		execution.replacementSessionPath = replacement;
		await lifecycle.resume(
			{
				runId,
				role: "verifier",
				message: "Start fresh if the context gate recommends it.",
			},
			toolUi.ctx,
		);
		active = getActiveWorkflowRun(store.getState());
		assert.equal(active?.roleSessions.verifier?.current, replacement);
		assert.deepEqual(active?.roleSessions.verifier?.history, [verifierSession]);
		// The real resume path writes a launch-profile sidecar for the fresh
		// replacement session; mirror it so later reads resolve the session.
		writeVerifierSession({
			root: project.root,
			definition: project.definition,
			runId,
			sessionPath: replacement,
			data: { ticket: "DOC-43", draft: draftPath, report: reportPath },
		});

		// ── Recovery: manifest label, current-session resolution, override
		//    isolated to current run assignments and the sidecar ──
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
		assert.match(toolUi.notifications[0]?.[0] ?? "", /Documentation verifier role failed/);
		assert.equal(execution.resume?.params.model, "pick");
		assert.equal(
			execution.resume?.recovery?.pickerTitle,
			"Resume model for Documentation verifier recovery",
		);
		assert.match(
			execution.resume?.params.message ?? "",
			/Verify the current draft independently and update only the report/,
		);

		await execution.resume?.recovery?.onSuccessfulResponse?.({
			provider: "omega",
			model: "relay-lite",
			thinking: "high",
		});
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
		}

		// ── Persistence + reload restoration: every committed transition was
		//    appended as a session entry; a running launch restores as
		//    interrupted with explicit guidance ──
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
		assert.equal(restoredActive.currentAssignments?.verifier?.model, "relay-lite");
		assert.equal(restoredActive.activeLaunch?.status, "interrupted");
		assert.equal(restoredActive.activeLaunch?.roleId, "verifier");
		const status = formatWorkflowRunStatus(restoredActive);
		assert.match(status, /interrupted/);
		assert.match(status, /Documentation verifier \(verifier\)/);
		assert.match(status, /Review detached repository changes manually/);

		// Definition snapshots survive package drift: mutate the package and
		// confirm the restored run keeps its original manifest snapshot.
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

		// ── Completion invalidates the token, keeps the audit snapshot, and
		//    survives a final reload as a non-active run ──
		const completed = lifecycle.complete({
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
		const finalRestore = restoreWorkflowRunStateFromSession(branchReaderFor(store));
		assert.equal(getActiveWorkflowRun(finalRestore.state), null);
		assert.equal(getWorkflowRunSnapshot(finalRestore.state, runId)?.status, "completed");
		assert.equal(
			getWorkflowRunSnapshot(finalRestore.state, runId)?.roleSessions.verifier?.current,
			replacement,
		);
	});
});
