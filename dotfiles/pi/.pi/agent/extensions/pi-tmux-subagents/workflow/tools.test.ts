import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
	readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
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
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import { buildWorkflowRolloverHandoffForRun } from "./handoff.ts";
import { buildWorkflowRecoveryMessage, buildWorkflowRecoveryLabels } from "./recovery.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	recordWorkflowRunRoleSession,
	restoreWorkflowRunStateFromBranch,
	startWorkflowRun,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import {
	createWorkflowLifecycleTools,
	registerWorkflowLifecycleTools,
	type WorkflowSubagentExecution,
	type WorkflowToolDependencies,
	type WorkflowToolStateStore,
} from "./tools.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

const TEST_MODELS = [
	{
		provider: "anthropic",
		id: "author-model",
		name: "Author model",
		api: "anthropic-messages",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 8_000,
	},
	{
		provider: "openai",
		id: "verify-model",
		name: "Verify model",
		api: "openai-responses",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 8_000,
	},
	{
		provider: "other",
		id: "recovery-model",
		name: "Recovery model",
		api: "openai-completions",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 8_000,
	},
] as any[];

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

async function withTempDir<T>(
	run: (root: string) => Promise<T> | T,
): Promise<T> {
	const root = mkdtempSync(join(tmpdir(), "workflow-tools-"));
	try {
		execFileSync("git", ["init", "-q", root]);
		return await run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function writeWorkflowPackage(root: string, verifierOptional?: boolean): string {
	const packageDir = join(root, "docs-review");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		join(packageDir, "workflow.json"),
		JSON.stringify({
			version: 1,
			id: "docs-review",
			command: {
				name: "docs-review",
				description: "Draft and verify documentation",
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
					handoff: "Continue the draft from the latest ticket and durable document.",
				},
				{
					id: "verifier",
					label: "Documentation verifier",
					agent: "fact-checker",
					...(verifierOptional !== undefined ? { optional: verifierOptional } : {}),
					reads: ["draft", "ticket", "report"],
					writes: ["file:report"],
					handoff: "Verify the current draft independently and update only the report.",
				},
			],
		}),
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
			"Use dedicated workflow tools.",
		].join("\n"),
	);
	return packageDir;
}

function loadDefinition(root: string, verifierOptional?: boolean): NormalizedWorkflowDefinition {
	const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, verifierOptional));
	assert.equal(loaded.status, "ok");
	if (loaded.status !== "ok") throw new Error("workflow fixture failed to load");
	return loaded.definition;
}

class StateStore implements WorkflowToolStateStore {
	state: WorkflowRunState;
	readonly persisted: WorkflowRunTransitionResult["snapshots"][number][] = [];

	constructor(state: WorkflowRunState) {
		this.state = state;
	}

	getState(): WorkflowRunState {
		return this.state;
	}

	commit(transition: WorkflowRunTransitionResult): void {
		this.state = transition.state;
		this.persisted.push(...transition.snapshots);
	}
}

class FakeExecution implements WorkflowSubagentExecution {
	stopSubagent(running: RunningSubagent): void {
		running.abortController?.abort();
	}
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
	resumeError?: Error;
	nextSessionPath = "/tmp/workflow-child.jsonl";

	async launchSubagent(
		params: SubagentLaunchParams,
		_ctx: any,
		options: any = {},
	): Promise<RunningSubagent> {
		this.launch = { params, options };
		return {
			id: "child-1",
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
		if (this.resumeError) throw this.resumeError;
		const sessionPath = this.replacementSessionPath ?? params.sessionPath;
		await lifecycle?.onLaunched?.({
			running: {
				id: "resume-1",
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

function startState(
	root: string,
	definition: NormalizedWorkflowDefinition,
	runId = "run-docs",
): WorkflowRunState {
	return startWorkflowRun(
		createWorkflowRunState(),
		{
			runId,
			source: "project",
			definition,
			projectRoot: root,
			policy: "per-role",
			assignmentSource: "configured",
			originalAssignments: {
				author: {
					provider: "anthropic",
					model: "author-model",
					thinking: "low",
				},
				verifier: {
					provider: "openai",
					model: "verify-model",
					thinking: "minimal",
				},
			},
			data: {
				draft: join(root, ".artifacts", "docs", "DRAFT.md"),
				report: join(root, ".artifacts", "docs", "REPORT.md"),
				ticket: "DOC-17",
			},
		},
	).state;
}

function toolContext(
	root: string,
	selections: string[] = [],
) {
	const selected = [...selections];
	const notifications: Array<[string, string]> = [];
	const selectionCalls: Array<{ title: string; choices: string[] }> = [];
	return {
		ctx: {
			sessionManager: {
				getSessionFile: () => join(root, "parent.jsonl"),
				getSessionId: () => "parent",
				getSessionDir: () => root,
			},
			cwd: root,
			model: TEST_MODELS[0],
			thinkingLevel: "off",
			scopedModels: [],
			modelRegistry: { getAvailable: () => TEST_MODELS },
			hasUI: true,
			ui: {
				select: async (title: string, choices: string[]) => {
					selectionCalls.push({ title, choices });
					return selected.shift();
				},
				notify: (message: string, level: string) => {
					notifications.push([message, level]);
				},
			},
		} as any,
		notifications,
		selectionCalls,
	};
}

function dependencies(
	store: StateStore,
	execution: FakeExecution,
): WorkflowToolDependencies {
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

function workflowMetadata(
	definition: NormalizedWorkflowDefinition,
	root: string,
	runId: string,
	roleId: string,
	data: Record<string, string>,
): LaunchProfileWorkflowMetadata {
	return {
		version: 1,
		workflowId: definition.id,
		runId,
		roleId,
		manifestHash: definition.manifestHash,
		skillHash: definition.skill.hash,
		policy: "per-role",
		assignmentSource: "configured",
		projectRoot: root,
		originalDefault: roleId === "author"
			? { provider: "anthropic", model: "author-model", thinking: "low" }
			: { provider: "openai", model: "verify-model", thinking: "minimal" },
		currentDefault: roleId === "author"
			? { provider: "anthropic", model: "author-model", thinking: "low" }
			: { provider: "openai", model: "verify-model", thinking: "minimal" },
		data,
	};
}

function writeRoleSession(input: {
	root: string;
	definition: NormalizedWorkflowDefinition;
	runId: string;
	roleId: "author" | "verifier";
	sessionPath: string;
}): void {
	mkdirSync(dirname(input.sessionPath), { recursive: true });
	writeFileSync(input.sessionPath, "{}\n");
	const role = input.definition.roleById[input.roleId]!;
	const data = {
		draft: join(input.root, ".artifacts", "docs", "DRAFT.md"),
		report: join(input.root, ".artifacts", "docs", "REPORT.md"),
		ticket: "DOC-17",
	};
	writeLaunchProfile(input.sessionPath, {
		version: 1,
		stable: {
			agentName: role.agent,
			displayName: role.label,
			roleBody: `You are ${role.agent}.`,
			roleBodyHash: "a".repeat(64),
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
			originalModel: input.roleId === "author"
				? { provider: "anthropic", model: "author-model", thinking: "low" }
				: { provider: "openai", model: "verify-model", thinking: "minimal" },
			lastModel: input.roleId === "author"
				? { provider: "anthropic", model: "author-model", thinking: "low" }
				: { provider: "openai", model: "verify-model", thinking: "minimal" },
			resumeCount: 0,
		},
		resources: {
			tools: fingerprintStrings([]),
			visibleSkills: fingerprintStrings([]),
			updatedAt: "2026-09-01T12:00:00.000Z",
		},
		workflow: workflowMetadata(
			input.definition,
			input.root,
			input.runId,
			input.roleId,
			data,
		),
	});
}

function recordSession(
	store: StateStore,
	runId: string,
	roleId: string,
	sessionPath: string,
): void {
	store.commit(
		recordWorkflowRunRoleSession(
			store.getState(),
			runId,
			roleId,
			sessionPath,
			{ launchStatus: "completed" },
		),
	);
}

test("workflow_spawn resolves arbitrary manifest roles, typed data, models, sidecars, and async boundaries", async () => {
	await withTempDir(async (root) => {
		writeFileSync(join(root, "README.md"), "docs\n");
		execFileSync("git", ["-C", root, "add", "README.md"]);
		execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "init"]);
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const execution = new FakeExecution();
		execution.nextSessionPath = join(root, "author-1.jsonl");
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx } = toolContext(root);

		const result = await lifecycle.spawn(
			{
				runId: "run-docs",
				role: "author",
				task: "Draft the deployment guide.",
				data: { ticket: "DOC-99" },
			},
			ctx,
		);

		assert.equal(result.details.status, "started");
		assert.equal(execution.launch?.params.agent, "scribe");
		assert.equal(execution.launch?.params.name, "Documentation author");
		assert.deepEqual(execution.launch?.options.resolvedModel?.selection, {
			provider: "anthropic",
			model: "author-model",
			thinking: "low",
		});
		assert.equal(execution.launch?.options.workflow?.workflowId, "docs-review");
		assert.equal(execution.launch?.options.workflow?.roleId, "author");
		assert.equal(execution.launch?.options.workflow?.data?.ticket, "DOC-99");
		assert.ok(execution.watch);
		assert.ok(execution.watch?.running.boundary);

		let active = getActiveWorkflowRun(store.getState());
		assert.equal(active?.roleSessions.author?.current, execution.nextSessionPath);
		assert.equal(active?.activeLaunch?.status, "running");
		assert.equal(active?.data.ticket, "DOC-99");
		assert.ok(store.persisted.length >= 3);

		const asyncResult = await execution.watch!.onSuccess({
			result: {
				name: "Documentation author",
				task: "Draft the deployment guide.",
				summary: "Draft complete.",
				sessionFile: execution.nextSessionPath,
				exitCode: 0,
				elapsed: 2,
				responded: true,
			},
			boundary: {
				details: {
					workflowWriteBoundary: {
						workflowId: "docs-review",
						roleId: "author",
						violated: true,
						unexpectedPaths: ["README.md"],
					},
				},
				violationText: "WORKFLOW WRITE POLICY VIOLATION",
			},
		});
		assert.match(asyncResult.content, /WORKFLOW WRITE POLICY VIOLATION/);
		assert.equal(
			(asyncResult.details.workflowWriteBoundary as any).roleId,
			"author",
		);
		active = getActiveWorkflowRun(store.getState());
		assert.equal(active?.activeLaunch?.status, "failed");
	});
});

test("tree navigation waits for a pending spawn and stops it without publishing late role state", async () => {
	await withTempDir(async (root) => {
		const store = new StateStore(startState(root, loadDefinition(root)));
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools({} as any, dependencies(store, execution));
		const { ctx } = toolContext(root);
		const launch = execution.launchSubagent.bind(execution);
		const started = deferred<void>();
		const release = deferred<void>();
		const stopped: RunningSubagent[] = [];
		execution.launchSubagent = async (...args) => {
			started.resolve();
			await release.promise;
			return launch(...args);
		};
		execution.stopSubagent = (running) => { stopped.push(running); };
		const pending = lifecycle.spawn({ runId: "run-docs", role: "author", task: "draft" }, ctx);
		const outcome = pending.catch((error: Error) => error);
		await started.promise;
		const persistedBefore = store.persisted.length;
		let navigated = false;
		const navigation = Promise.resolve(lifecycle.stopBeforeTree()).then(() => { navigated = true; });
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(navigated, false, "navigation must await the in-flight child launch");
		release.resolve();
		await navigation;
		assert.match(String(await outcome), /branch|navigation/i);
		assert.equal(stopped.length, 1);
		assert.equal(execution.watch, undefined);
		assert.equal(store.persisted.length, persistedBefore + 1, "only the stop may persist an interrupted transition");
		assert.equal(store.persisted.at(-1)?.activeLaunch?.status, "interrupted");
		assert.equal(getActiveWorkflowRun(store.state)?.roleSessions.author, undefined);
	});
});

test("stopping for tree navigation persists interruption even when navigation is later cancelled", async () => {
	await withTempDir(async (root) => {
		const store = new StateStore(startState(root, loadDefinition(root)));
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools({} as any, dependencies(store, execution));
		const { ctx } = toolContext(root);
		await lifecycle.spawn({ runId: "run-docs", role: "author", task: "draft" }, ctx);
		const sessionPath = getActiveWorkflowRun(store.state)?.roleSessions.author?.current;
		await lifecycle.stopBeforeTree();
		// Another extension can cancel after this handler, so session_tree may never fire.
		assert.equal(getActiveWorkflowRun(store.state)?.activeLaunch?.status, "interrupted");
		assert.equal(store.persisted.at(-1)?.activeLaunch?.status, "interrupted");
		assert.equal(getActiveWorkflowRun(store.state)?.roleSessions.author?.current, sessionPath);
	});
});

for (const phase of ["later handler", "cancelled handler", "summarizer", "failed summarizer", "aborted summarizer"]) {
test(`SDK navigation blocks ordinary-completion role launches during ${phase} and releases at a safe idle boundary`, async () => {
	await withTempDir(async (root) => {
		const summarize = phase.includes("summarizer");
		const store = new StateStore(startState(root, loadDefinition(root)));
		const execution = new FakeExecution();
		const { ctx } = toolContext(root);
		let lifecycle!: ReturnType<typeof createWorkflowLifecycleTools>;
		let launchCount = 0;
		const launch = execution.launchSubagent.bind(execution);
		execution.launchSubagent = async (...args) => { launchCount++; return launch(...args); };
		const laterHandler = deferred<void>();
		const releaseHandler = deferred<void>();
		const outcomes: unknown[] = [];
		let navigationSignal: AbortSignal | undefined;
		let branch: any[] = [];
		let treeEvents = 0;
		const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
		const resourceLoader = new DefaultResourceLoader({
			cwd: root, agentDir: root, settingsManager,
			noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
			extensionFactories: [
				(pi) => {
					pi.registerProvider("anthropic", {
						baseUrl: "https://unused.test", apiKey: "test-only", api: "anthropic-messages",
						models: [TEST_MODELS[0]],
					});
					lifecycle = registerWorkflowLifecycleTools(pi, dependencies(store, execution));
					pi.on("session_before_tree", async (event) => {
						navigationSignal = event.signal;
						await lifecycle.stopBeforeTree();
					});
					pi.on("session_tree", () => {
						treeEvents++;
						store.state = restoreWorkflowRunStateFromBranch(branch).state;
					});
				},
				(pi) => {
					pi.on("session_before_tree", async () => {
						if (!summarize) {
							laterHandler.resolve();
							await releaseHandler.promise;
							if (phase === "cancelled handler") return { cancel: true };
						}
					});
				},
			],
		});
		await resourceLoader.reload();
		const modelRuntime = await ModelRuntime.create({
			authPath: join(root, "auth.json"), modelsPath: join(root, "models.json"),
			modelsStorePath: join(root, "models-store.json"),
		});
		await modelRuntime.setRuntimeApiKey("anthropic", "test-only");
		const sessionManager = SessionManager.create(root, join(root, "sessions"));
		const target = sessionManager.appendCustomEntry("target", {});
		sessionManager.appendMessage({ role: "user", content: "abandoned work", timestamp: 1 });
		const { session } = await createAgentSession({
			cwd: root, agentDir: root, model: TEST_MODELS[0], modelRuntime,
			sessionManager, settingsManager, resourceLoader, noTools: "builtin",
		});
		let summaryStarted = false;
		session.subscribe((event) => {
			if (event.type === "tool_execution_end" && event.toolName === "workflow_spawn") {
				outcomes.push(event.result);
			}
		});
		let toolCall = 0;
		session.agent.streamFunction = (_model, context) => {
			const stream = createAssistantMessageEventStream();
			const message: any = {
				role: "assistant", content: [{ type: "text", text: "done" }],
				api: "anthropic-messages", provider: "anthropic", model: "author-model",
				usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "stop", timestamp: 2,
			};
			if (summarize && !summaryStarted) {
				summaryStarted = true;
				laterHandler.resolve();
				void releaseHandler.promise.then(() => {
					if (phase === "failed summarizer" || phase === "aborted summarizer") {
						message.stopReason = phase === "failed summarizer" ? "error" : "aborted";
						message.errorMessage = "summary failed";
						stream.push({ type: "error", reason: message.stopReason, error: message });
					} else {
						stream.push({ type: "done", reason: "stop", message });
					}
				});
			} else {
				if (context.messages.at(-1)?.role !== "toolResult") {
					message.content = [{
						type: "toolCall", id: `spawn-${++toolCall}`, name: "workflow_spawn",
						arguments: { runId: "run-docs", role: "author", task: "late draft" },
					}];
					message.stopReason = "toolUse";
				}
				stream.push({ type: "done", reason: message.stopReason, message });
			}
			return stream;
		};
		await session.bindExtensions({});
		ctx.isIdle = () => session.isIdle;
		try {
			await lifecycle.spawn({ runId: "run-docs", role: "author", task: "initial draft" }, ctx);
			branch = [{ type: "custom", customType: "pi-tmux-subagents.workflow-run", data: getActiveWorkflowRun(store.state) }];
			const old = execution.watch!;
			const navigation = session.navigateTree(target, { summarize }).catch((error: Error) => error);
			await laterHandler.promise;
			assert.equal(session.isIdle, false);
			if (phase === "aborted summarizer") session.abortBranchSummary();
			await session.sendCustomMessage({
				customType: "subagent_result", content: "An ordinary subagent completed.", display: true,
			}, { triggerTurn: true, deliverAs: "steer" });
			assert.match((outcomes[0] as any).content[0].text, /branch navigation/i);
			assert.equal(launchCount, 1, "no child may start after the workflow stop and before navigation completes");
			releaseHandler.resolve();
			const outcome = await navigation;
			const succeeded = phase === "later handler" || phase === "summarizer";
			if (phase === "failed summarizer") assert.match(String(outcome), /summary failed/);
			else assert.equal((outcome as any).cancelled, !succeeded);
			assert.equal(treeEvents, succeeded ? 1 : 0);
			assert.equal(navigationSignal!.aborted, phase === "aborted summarizer",
				"native cancellation/errors do not reliably abort the navigation signal");
			const persisted = store.persisted.length;
			const result = { name: "Author", task: "draft", summary: "late", exitCode: 0, elapsed: 1 };
			await old.onSuccess({ result });
			await old.onError("late failure");
			await old.onPing!({ result: { ...result, ping: { name: "Author", message: "help" } } });
			assert.equal(store.persisted.length, persisted);
			assert.equal(getActiveWorkflowRun(store.state)?.activeLaunch?.status, "interrupted");
			await session.prompt("Continue the restored workflow.");
			assert.equal((outcomes[1] as any).details.status, "started", "a settled navigation must not wedge the next prompt");
		} finally {
			releaseHandler.resolve();
			session.dispose();
		}
	});
});
}

test("old spawn success, error, and ping callbacks cannot change the restored interrupted role", async () => {
	await withTempDir(async (root) => {
		const store = new StateStore(startState(root, loadDefinition(root)));
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools({} as any, dependencies(store, execution));
		const { ctx } = toolContext(root);
		await lifecycle.spawn({ runId: "run-docs", role: "author", task: "draft" }, ctx);
		const branch = [{
			type: "custom",
			customType: "pi-tmux-subagents.workflow-run",
			data: getActiveWorkflowRun(store.state),
		}] as any;
		const old = execution.watch!;
		await lifecycle.stopBeforeTree();
		store.state = restoreWorkflowRunStateFromBranch(branch).state;
		const restored = store.state;
		assert.equal(getActiveWorkflowRun(restored)?.activeLaunch?.status, "interrupted");
		const count = store.persisted.length;
		const result = { name: "Author", task: "draft", summary: "late", exitCode: 0, elapsed: 1 };
		await old.onSuccess({ result });
		await old.onError("late failure");
		await old.onPing!({ result: { ...result, ping: { name: "Author", message: "help" } } });
		assert.equal(store.state, restored);
		assert.equal(store.persisted.length, count);
	});
});

test("tree navigation ends recovery ownership even when the restored branch has identical role session IDs", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const sessionPath = join(root, "author.jsonl");
		writeRoleSession({ root, definition, runId: "run-docs", roleId: "author", sessionPath });
		recordSession(store, "run-docs", "author", sessionPath);
		const execution = new FakeExecution();
		const stopped: RunningSubagent[] = [];
		execution.stopSubagent = (running) => { stopped.push(running); };
		const lifecycle = createWorkflowLifecycleTools({} as any, dependencies(store, execution));
		const { ctx } = toolContext(root);
		// Use the actual recovery gate label without depending on its presentation.
		ctx.ui.select = async (_title: string, choices: string[]) => choices[0];
		await lifecycle.recover({ runId: "run-docs", role: "author", failure: "quota exceeded" }, ctx);
		assert.ok(execution.resume?.lifecycle);
		const old = execution.resume;
		const restored = structuredClone(store.state);
		await lifecycle.stopBeforeTree();
		assert.equal(stopped.length, 1, "recovery children are owned workflow roles too");
		store.state = restored;
		const before = structuredClone(store.state);
		const persistedBefore = store.persisted.length;
		const profileBefore = readLaunchProfile(sessionPath);
		await old.lifecycle!.onResult!({
			result: { name: "Author", task: "recover", summary: "late", exitCode: 0, elapsed: 1 },
			replacement: false, originalSessionPath: sessionPath, sessionPath,
		});
		await old.lifecycle!.onError!({
			message: "late failure", replacement: false, originalSessionPath: sessionPath, sessionPath,
		});
		await old.recovery!.onSuccessfulResponse!({ provider: "other", model: "recovery-model", thinking: "high" });
		assert.deepEqual(store.state, before);
		assert.equal(store.persisted.length, persistedBefore);
		assert.deepEqual(readLaunchProfile(sessionPath), profileBefore);
	});
});

for (const replacement of [false, true]) {
	test(`tree navigation drains a pending ${replacement ? "rollover" : "same-session resume"} without recording stale session state`, async () => {
		await withTempDir(async (root) => {
			const definition = loadDefinition(root);
			const store = new StateStore(startState(root, definition));
			const sessionPath = join(root, "author.jsonl");
			writeRoleSession({ root, definition, runId: "run-docs", roleId: "author", sessionPath });
			recordSession(store, "run-docs", "author", sessionPath);
			const execution = new FakeExecution();
			if (replacement) execution.replacementSessionPath = join(root, "replacement.jsonl");
			const started = deferred<void>();
			const release = deferred<void>();
			const resume = execution.executeSubagentResume.bind(execution);
			execution.executeSubagentResume = async (...args) => {
				started.resolve();
				await release.promise;
				return resume(...args);
			};
			const stopped: RunningSubagent[] = [];
			execution.stopSubagent = (running) => { stopped.push(running); };
			const lifecycle = createWorkflowLifecycleTools({} as any, dependencies(store, execution));
			const { ctx } = toolContext(root);
			const outcome = lifecycle.resume({ runId: "run-docs", role: "author" }, ctx).catch((error: Error) => error);
			await started.promise;
			const persistedBefore = store.persisted.length;
			let navigated = false;
			const navigation = lifecycle.stopBeforeTree().then(() => { navigated = true; });
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(navigated, false);
			release.resolve();
			await navigation;
			assert.match(String(await outcome), /branch|navigation/i);
			assert.equal(stopped.length, 1);
			assert.equal(stopped[0].sessionFile, replacement ? execution.replacementSessionPath : sessionPath);
			assert.equal(store.persisted.length, persistedBefore + 1, "only the stop may persist an interrupted transition");
			assert.equal(store.persisted.at(-1)?.activeLaunch?.status, "interrupted");
			assert.equal(getActiveWorkflowRun(store.state)?.roleSessions.author?.current, sessionPath);
		});
	});
}

test("workflow_resume resolves the current role session and fresh replacements preserve history", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const sessionPath = join(root, "verifier-1.jsonl");
		writeRoleSession({
			root,
			definition,
			runId: "run-docs",
			roleId: "verifier",
			sessionPath,
		});
		recordSession(store, "run-docs", "verifier", sessionPath);
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx } = toolContext(root);

		await lifecycle.resume(
			{
				runId: "run-docs",
				role: "verifier",
				message: "Check the updated examples.",
				data: { ticket: "DOC-18" },
				model: "previous",
			},
			ctx,
		);
		assert.equal(execution.resume?.params.sessionPath, sessionPath);
		assert.equal(execution.resume?.params.model, "previous");
		assert.equal(execution.resume?.lifecycle?.workflowMetadata?.data?.ticket, "DOC-18");
		let active = getActiveWorkflowRun(store.getState());
		assert.equal(active?.roleSessions.verifier?.current, sessionPath);
		assert.deepEqual(active?.roleSessions.verifier?.history, []);

		const replacement = join(root, "verifier-2.jsonl");
		execution.replacementSessionPath = replacement;
		await lifecycle.resume(
			{
				runId: "run-docs",
				role: "verifier",
				message: "Start fresh if the context gate recommends it.",
			},
			ctx,
		);
		active = getActiveWorkflowRun(store.getState());
		assert.equal(active?.roleSessions.verifier?.current, replacement);
		assert.deepEqual(active?.roleSessions.verifier?.history, [sessionPath]);
		assert.match(
			execution.resume?.lifecycle?.rolloverMessage ?? "",
			/Verify the current draft independently/,
		);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Ticket: DOC-18/);
	});
});

test("workflow_resume marks a starting launch failed when shared resume throws", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const sessionPath = join(root, "verifier-resume-throws.jsonl");
		writeRoleSession({
			root,
			definition,
			runId: "run-docs",
			roleId: "verifier",
			sessionPath,
		});
		recordSession(store, "run-docs", "verifier", sessionPath);
		const execution = new FakeExecution();
		execution.resumeError = new Error("resume launch exploded");
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx } = toolContext(root);

		await assert.rejects(
			() => lifecycle.resume(
				{
					runId: "run-docs",
					role: "verifier",
					message: "Continue verification.",
				},
				ctx,
			),
			/resume launch exploded/,
		);
		assert.deepEqual(
			getActiveWorkflowRun(store.getState())?.activeLaunch,
			{
				roleId: "verifier",
				sessionPath,
				status: "failed",
			},
		);
	});
});

test("workflow_recover uses manifest labels and handoff, then overrides only the current run assignment", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const sessionPath = join(root, "verifier-recover.jsonl");
		writeRoleSession({
			root,
			definition,
			runId: "run-docs",
			roleId: "verifier",
			sessionPath,
		});
		recordSession(store, "run-docs", "verifier", sessionPath);
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx, notifications, selectionCalls } = toolContext(root, [
			"Select a replacement model and thinking level",
		]);

		const result = await lifecycle.recover(
			{
				runId: "run-docs",
				role: "verifier",
				failure: "Provider quota exhausted; purchase more credits",
				message: "Recheck the code samples.",
			},
			ctx,
		);
		assert.equal(result.details.status, "started");
		assert.equal(selectionCalls[0]?.title, "Recover the Documentation verifier role?");
		assert.match(notifications[0]?.[0] ?? "", /Documentation verifier role failed/);
		assert.equal(execution.resume?.params.sessionPath, sessionPath);
		assert.equal(execution.resume?.params.model, "pick");
		assert.equal(
			execution.resume?.recovery?.pickerTitle,
			"Resume model for Documentation verifier recovery",
		);
		assert.match(
			execution.resume?.params.message ?? "",
			/Verify the current draft independently and update only the report/,
		);
		assert.match(execution.resume?.params.message ?? "", /Ticket: DOC-17/);
		assert.doesNotMatch(execution.resume?.params.message ?? "", /unreadable/i);

		await execution.resume?.recovery?.onSuccessfulResponse?.({
			provider: "other",
			model: "recovery-model",
			thinking: "high",
		});
		const active = getActiveWorkflowRun(store.getState());
		assert.deepEqual(active?.originalAssignments?.verifier, {
			provider: "openai",
			model: "verify-model",
			thinking: "minimal",
		});
		assert.deepEqual(active?.currentAssignments?.verifier, {
			provider: "other",
			model: "recovery-model",
			thinking: "high",
		});
		const sidecar = readLaunchProfile(sessionPath);
		assert.equal(sidecar.status, "ok");
		if (sidecar.status === "ok") {
			assert.equal(sidecar.profile.workflow?.assignmentSource, "recovery");
			assert.equal(sidecar.profile.workflow?.currentDefault?.model, "recovery-model");
		}
	});
});

test("workflow_recover marks a starting launch failed when shared recovery resume throws", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const sessionPath = join(root, "verifier-recovery-throws.jsonl");
		writeRoleSession({
			root,
			definition,
			runId: "run-docs",
			roleId: "verifier",
			sessionPath,
		});
		recordSession(store, "run-docs", "verifier", sessionPath);
		const execution = new FakeExecution();
		execution.resumeError = new Error("recovery launch exploded");
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx } = toolContext(root, [
			"Select a replacement model and thinking level",
		]);

		await assert.rejects(
			() => lifecycle.recover(
				{
					runId: "run-docs",
					role: "verifier",
					failure: "Provider quota exhausted; purchase more credits",
				},
				ctx,
			),
			/recovery launch exploded/,
		);
		assert.deepEqual(
			getActiveWorkflowRun(store.getState())?.activeLaunch,
			{
				roleId: "verifier",
				sessionPath,
				status: "failed",
			},
		);
	});
});

test("workflow_complete and abort invalidate old run tokens while preserving audit data", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition, "run-complete"));
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx } = toolContext(root);

		const completed = lifecycle.complete({
			runId: "run-complete",
			status: "completed",
			summary: "Docs verified.",
		});
		assert.match(completed.content[0]!.text, /Docs verified/);
		assert.equal(getActiveWorkflowRun(store.getState()), null);
		await assert.rejects(
			() => lifecycle.spawn({
				runId: "run-complete",
				role: "author",
				task: "Late call",
			}, ctx),
			/stale|completed/i,
		);

		store.state = startWorkflowRun(
			store.getState(),
			{
				runId: "run-abort",
				source: "project",
				definition,
				projectRoot: root,
				policy: "parent-per-role",
				assignmentSource: "parent",
			},
		).state;
		const aborted = lifecycle.complete({
			runId: "run-abort",
			status: "aborted",
		});
		assert.match(aborted.content[0]!.text, /aborted/);
		await assert.rejects(
			() => lifecycle.resume({
				runId: "run-abort",
				role: "verifier",
			}, ctx),
			/stale|aborted/i,
		);
	});
});

test("workflow lifecycle rejects unknown roles and invalid typed data before launch", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root);
		const store = new StateStore(startState(root, definition));
		const execution = new FakeExecution();
		const lifecycle = createWorkflowLifecycleTools(
			{ sendMessage() {} } as any,
			dependencies(store, execution),
		);
		const { ctx } = toolContext(root);

		await assert.rejects(
			() => lifecycle.spawn({
				runId: "run-docs",
				role: "reviewer",
				task: "Wrong role",
			}, ctx),
			/Valid roles: author, verifier/,
		);
		await assert.rejects(
			() => lifecycle.spawn({
				runId: "run-docs",
				role: "author",
				task: "Bad data",
				data: { draft: "relative/DRAFT.md" },
			}, ctx),
			/absolute path/,
		);
		assert.equal(execution.launch, undefined);
	});
});

test("skipped spawn, resume, recovery, and handoffs reject before any data, sidecar, state, UI, or process mutation", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root, true);
		const state = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-skipped",
			source: "project",
			definition,
			projectRoot: root,
			policy: "per-role",
			assignmentSource: "preset",
			originalAssignments: {
				author: { provider: "anthropic", model: "author-model", thinking: "low" },
				verifier: { skip: true },
			},
			data: { ticket: "original" },
		}).state;
		const store = new StateStore(state);
		const execution = new FakeExecution();
		const deps = dependencies(store, execution);
		deps.loadAgentDefaults = () => { throw new Error("must not load skipped agent"); };
		const lifecycle = createWorkflowLifecycleTools({ sendMessage() {} } as any, deps);
		const { ctx, notifications, selectionCalls } = toolContext(root);
		const sessionPath = join(root, "skipped.jsonl");
		writeRoleSession({ root, definition, runId: "run-skipped", roleId: "verifier", sessionPath });
		const sidecar = readLaunchProfile(sessionPath);
		const before = JSON.stringify(store.state);
		const common = { runId: "run-skipped", role: "verifier", data: { ticket: "must not persist" } };
		await assert.rejects(lifecycle.spawn({ ...common, task: "Must not run" }, ctx), /"verifier" is skipped/);
		await assert.rejects(lifecycle.resume({ ...common, model: "parent" }, ctx), /"verifier" is skipped/);
		await assert.rejects(lifecycle.recover({ ...common, failure: "quota exceeded" }, ctx), /"verifier" is skipped/);
		const snapshot = getActiveWorkflowRun(state)!;
		assert.throws(() => buildWorkflowRolloverHandoffForRun({ snapshot, roleId: "verifier" }), /is skipped/);
		assert.throws(() => buildWorkflowRecoveryMessage({ snapshot, roleId: "verifier" }), /is skipped/);
		assert.throws(() => buildWorkflowRecoveryLabels(snapshot, "verifier"), /is skipped/);
		assert.equal(JSON.stringify(store.state), before);
		assert.deepEqual(store.persisted, []);
		assert.deepEqual(readLaunchProfile(sessionPath), sidecar);
		assert.equal(readFileSync(sessionPath, "utf8"), "{}\n");
		assert.equal(execution.launch, undefined);
		assert.equal(execution.resume, undefined);
		assert.equal(execution.watch, undefined);
		assert.deepEqual(notifications, []);
		assert.deepEqual(selectionCalls, []);
	});
});

test("enabled optional roles launch and roll over with model-only metadata and declared readable handoffs", async () => {
	await withTempDir(async (root) => {
		const definition = loadDefinition(root, true);
		const store = new StateStore(startState(root, definition));
		const execution = new FakeExecution();
		execution.nextSessionPath = join(root, "verifier.jsonl");
		const lifecycle = createWorkflowLifecycleTools({ sendMessage() {} } as any, dependencies(store, execution));
		const { ctx } = toolContext(root);
		await lifecycle.spawn({ runId: "run-docs", role: "verifier", task: "Verify" }, ctx);
		assert.deepEqual(execution.launch?.options.workflow?.originalDefault, {
			provider: "openai", model: "verify-model", thinking: "minimal",
		});
		assert.equal(JSON.stringify(execution.launch?.options.workflow).includes('"skip"'), false);
		writeRoleSession({
			root, definition, runId: "run-docs", roleId: "verifier", sessionPath: execution.nextSessionPath,
		});
		execution.replacementSessionPath = join(root, "verifier-rollover.jsonl");
		await lifecycle.resume({ runId: "run-docs", role: "verifier", message: "Check latest draft" }, ctx);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /fresh same-role rollover/);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /update only the report/);
		assert.match(execution.resume?.lifecycle?.rolloverMessage ?? "", /Check latest draft/);
		assert.equal(getActiveWorkflowRun(store.state)?.roleSessions.verifier?.current, execution.replacementSessionPath);
		assert.deepEqual(getActiveWorkflowRun(store.state)?.roleSessions.verifier?.history, [execution.nextSessionPath]);
	});
});
