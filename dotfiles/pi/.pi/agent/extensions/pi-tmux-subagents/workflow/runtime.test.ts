import assert from "node:assert/strict";
import test from "node:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { discoverWorkflowRegistry } from "./registry.ts";
import {
	buildWorkflowSkillMessage,
	createWorkflowCommandRuntime,
	formatWorkflowRegistryList,
	formatWorkflowRunStatus,
	registerWorkflowCommands,
	workflowArgumentCompletions,
	type WorkflowCommandStateStore,
} from "./runtime.ts";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	mergeWorkflowRunData,
	recordWorkflowRunRoleSession,
	setWorkflowRunActiveLaunch,
	startWorkflowRun,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

async function withTempDir<T>(run: (root: string) => Promise<T> | T): Promise<T> {
	const root = mkdtempSync(join(tmpdir(), "workflow-runtime-"));
	try {
		return await run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function workflowManifest(input: {
	id: string;
	alias?: string;
	authorAgent?: string;
	verifierAgent?: string;
}) {
	return {
		version: 1,
		id: input.id,
		command: {
			name: input.alias ?? input.id,
			description: `Run the ${input.id} workflow`,
			argumentHint: "<request>",
		},
		skill: "SKILL.md",
		data: {
			draft: {
				kind: "file",
				label: "Draft",
				constraint: {
					under: ".artifacts/docs",
					basename: "DRAFT.md",
				},
			},
			ticket: {
				kind: "string",
				label: "Ticket",
			},
		},
		roles: [
			{
				id: "author",
				label: "Documentation author",
				agent: input.authorAgent ?? "scribe",
				reads: ["ticket", "draft"],
				writes: ["file:draft"],
				handoff: "Continue authoring the durable draft.",
			},
			{
				id: "verifier",
				label: "Documentation verifier",
				agent: input.verifierAgent ?? "fact-checker",
				reads: ["draft"],
				writes: [],
				handoff: "Verify the current draft independently.",
			},
		],
	};
}

function writeWorkflowPackage(
	root: string,
	input: Parameters<typeof workflowManifest>[0],
): string {
	const packagePath = join(root, input.id);
	mkdirSync(packagePath, { recursive: true });
	writeFileSync(
		join(packagePath, "workflow.json"),
		`${JSON.stringify(workflowManifest(input), null, 2)}\n`,
	);
	writeFileSync(
		join(packagePath, "SKILL.md"),
		[
			"---",
			`name: ${input.id}-private`,
			"description: Private workflow orchestration.",
			"---",
			"",
			`# ${input.id}`,
			"",
			"Use only dedicated workflow lifecycle tools.",
			"",
		].join("\n"),
	);
	return packagePath;
}

function loadDefinition(packagePath: string): NormalizedWorkflowDefinition {
	const loaded = loadWorkflowDefinitionFromPackage(packagePath);
	assert.equal(loaded.status, "ok");
	if (loaded.status !== "ok") throw new Error("fixture failed");
	return loaded.definition;
}

class StateStore implements WorkflowCommandStateStore {
	state: WorkflowRunState;
	readonly persisted: WorkflowRunTransitionResult["snapshots"][number][] = [];

	constructor(state = createWorkflowRunState()) {
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

class FakePi {
	readonly commands: Array<{
		name: string;
		description?: string;
		getArgumentCompletions?: (prefix: string) => unknown;
		handler: (args: string, ctx: any) => Promise<void>;
	}> = [];
	readonly externalCommands: SlashCommandInfo[] = [];
	readonly sentUserMessages: string[] = [];

	registerCommand(name: string, options: any): void {
		const command = { name, ...options };
		const existing = this.commands.findIndex(
			(candidate) => candidate.name === name,
		);
		if (existing === -1) {
			this.commands.push(command);
		} else {
			this.commands[existing] = command;
		}
	}

	getCommands(): SlashCommandInfo[] {
		const extensionCommands = [
			...this.commands.map((command) => ({
				name: command.name,
				description: command.description,
				source: "extension" as const,
				sourceInfo: {
					path: "/tmp/workflow-runtime.test.ts",
					source: "test",
					scope: "temporary" as const,
					origin: "top-level" as const,
				},
			})),
			...this.externalCommands.filter(
				(command) => command.source === "extension",
			),
		];
		const counts = new Map<string, number>();
		for (const command of extensionCommands) {
			counts.set(command.name, (counts.get(command.name) ?? 0) + 1);
		}
		const occurrences = new Map<string, number>();
		const resolvedExtensions = extensionCommands.map((command) => {
			const occurrence = (occurrences.get(command.name) ?? 0) + 1;
			occurrences.set(command.name, occurrence);
			return {
				...command,
				name: (counts.get(command.name) ?? 0) > 1
					? `${command.name}:${occurrence}`
					: command.name,
			};
		});
		return [
			...resolvedExtensions,
			...this.externalCommands.filter(
				(command) => command.source !== "extension",
			),
		];
	}

	sendUserMessage(message: string): void {
		this.sentUserMessages.push(message);
	}

	command(name: string) {
		const command = this.commands.find((candidate) => candidate.name === name);
		assert.ok(command, `missing /${name}`);
		return command;
	}
}

function commandContext(
	root: string,
	options: {
		confirm?: boolean[];
		hasUI?: boolean;
		idle?: boolean;
	} = {},
) {
	const notifications: Array<{ message: string; level: string }> = [];
	const confirmations = [...(options.confirm ?? [])];
	return {
		ctx: {
			cwd: root,
			hasUI: options.hasUI ?? true,
			isIdle: () => options.idle ?? true,
			isProjectTrusted: () => true,
			sessionManager: {
				getSessionFile: () => join(root, "parent.jsonl"),
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				confirm: async () => confirmations.shift() ?? false,
				select: async () => undefined,
			},
		} as any,
		notifications,
	};
}

function startedState(
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
				ticket: "DOC-17",
			},
		},
	).state;
}

function discoverFrom(
	bundledRoot: string,
	globalRoot: string,
) {
	return (ctx: any, existingCommands: readonly any[]) =>
		discoverWorkflowRegistry({
			bundledRoot,
			globalRoot,
			projectRoot: ctx.cwd,
			projectTrusted: true,
			existingCommands,
		});
}

function startupResult(root: string) {
	return {
		status: "started" as const,
		state: {
			workflowId: "ignored-by-runtime",
			policy: "parent-per-role" as const,
			assignmentSource: "parent" as const,
			projectRoot: root,
			updatedAt: "2026-09-01T12:00:00.000Z",
		},
	};
}

test("private skill startup message is manifest-driven, structured, and appends the request verbatim", async () => {
	await withTempDir((root) => {
		const definition = loadDefinition(
			writeWorkflowPackage(join(root, "workflows"), { id: "docs-review" }),
		);
		let state = startedState(root, definition);
		state = recordWorkflowRunRoleSession(
			state,
			"run-docs",
			"author",
			join(root, "author.jsonl"),
			{ launchStatus: "running" },
		).state;
		state = setWorkflowRunActiveLaunch(
			state,
			"run-docs",
			{
				roleId: "author",
				sessionPath: join(root, "author.jsonl"),
				status: "interrupted",
			},
		).state;
		const snapshot = getActiveWorkflowRun(state);
		assert.ok(snapshot);
		const request = "  Preserve this spacing.\nAnd this second line.";
		const message = buildWorkflowSkillMessage(snapshot, request);

		assert.match(
			message,
			/^<skill name="docs-review-private" location=".*SKILL\.md">\n# docs-review/m,
		);
		assert.doesNotMatch(message, /^---$/m);
		assert.match(message, /<workflow-config version="1" mode="start">/);
		assert.match(message, /- runId: "run-docs"/);
		assert.match(message, /id="author".*agent="scribe"/);
		assert.match(message, /id="ticket" kind=string label="Ticket"/);
		assert.match(message, /workflow_spawn/);
		assert.match(message, /workflow_resume/);
		assert.match(message, /workflow_recover/);
		assert.match(message, /workflow_complete: MUST be called exactly once/);
		assert.match(message, /status: "interrupted"/);
		assert.match(message, /current=".*author\.jsonl"/);
		assert.equal(message.endsWith(request), true);
		assert.doesNotMatch(message, /planner|task-writer|PLAN\.md|TASKS\.md|REVIEW\.md/);
	});
});

test("startup discovery registers only collision-free aliases once and updates /workflow autocomplete", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });
		writeWorkflowPackage(bundledRoot, { id: "docs-review", alias: "draft-docs" });
		writeWorkflowPackage(bundledRoot, { id: "alpha", alias: "ship" });
		writeWorkflowPackage(bundledRoot, { id: "beta", alias: "ship" });
		writeWorkflowPackage(bundledRoot, { id: "occupied", alias: "deploy" });

		const pi = new FakePi();
		pi.externalCommands.push({
			name: "deploy",
			description: "Existing prompt",
			source: "prompt",
			sourceInfo: {
				path: join(root, "deploy.md"),
				source: "test",
				scope: "user",
				origin: "top-level",
			},
		});
		const store = new StateStore();
		const runtime = registerWorkflowCommands(pi as any, {
			state: store,
			loadAgent: () => ({}),
			isTmuxAvailable: () => true,
			muxSetupHint: () => "start tmux",
			discoverRegistry: discoverFrom(bundledRoot, globalRoot),
			chooseStartup: async (_ctx, _definition, projectRoot) =>
				startupResult(projectRoot),
		});
		const { ctx, notifications } = commandContext(root);

		const first = runtime.refreshRegistry(ctx);
		assert.equal(first.aliases["draft-docs"], "docs-review");
		assert.equal(first.aliases.ship, undefined);
		assert.equal(first.aliases.deploy, undefined);
		const generated = pi.commands.find(
			(command) => command.name === "draft-docs",
		);
		assert.ok(generated);
		assert.equal(
			generated.description,
			"<request> — Run the docs-review workflow",
		);
		assert.equal(pi.commands.some((command) => command.name === "ship"), false);
		assert.equal(pi.commands.filter((command) => command.name === "deploy").length, 0);

		runtime.refreshRegistry(ctx);
		assert.equal(
			pi.commands.filter((command) => command.name === "draft-docs").length,
			1,
			"session_start/reload refresh must not duplicate generated aliases",
		);

		const workflowCommand = pi.command("workflow");
		const completions = workflowCommand.getArgumentCompletions?.("run doc") as any[];
		assert.deepEqual(completions.map((item) => item.value), ["run docs-review "]);
		assert.deepEqual(
			workflowArgumentCompletions("", first.workflows)?.map((item) => item.value),
			["list", "run ", "status", "abort"],
		);

		await pi.command("workflows").handler("", ctx);
		assert.match(notifications.at(-1)?.message ?? "", /docs-review/);
		assert.match(notifications.at(-1)?.message ?? "", /source bundled/);
		assert.match(notifications.at(-1)?.message ?? "", /package:/);
		assert.match(notifications.at(-1)?.message ?? "", /alias=\/ship/);
		assert.match(notifications.at(-1)?.message ?? "", /alias=\/deploy/);
	});
});

test("generated alias handlers resolve the current registry owner after reload", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });
		writeWorkflowPackage(bundledRoot, { id: "alpha", alias: "shared" });
		writeWorkflowPackage(bundledRoot, { id: "beta", alias: "beta" });

		const pi = new FakePi();
		const store = new StateStore();
		const runtime = registerWorkflowCommands(pi as any, {
			state: store,
			loadAgent: () => ({}),
			isTmuxAvailable: () => true,
			muxSetupHint: () => "start tmux",
			discoverRegistry: discoverFrom(bundledRoot, globalRoot),
			createRunId: () => "run-rebound",
			chooseStartup: async (_ctx, _definition, projectRoot) =>
				startupResult(projectRoot),
		});
		const { ctx } = commandContext(root);

		const first = runtime.refreshRegistry(ctx);
		assert.equal(first.aliases.shared, "alpha");
		const sharedCommand = pi.command("shared");

		writeWorkflowPackage(bundledRoot, { id: "alpha", alias: "alpha" });
		writeWorkflowPackage(bundledRoot, { id: "beta", alias: "shared" });
		const reloaded = runtime.refreshRegistry(ctx);
		assert.equal(reloaded.aliases.shared, "beta");
		assert.equal(
			pi.commands.filter((command) => command.name === "shared").length,
			1,
		);

		await sharedCommand.handler("Run the new owner.", ctx);
		assert.equal(getActiveWorkflowRun(store.getState())?.workflowId, "beta");
		assert.equal(pi.sentUserMessages.length, 1);
		assert.match(pi.sentUserMessages[0], /- id: "beta"/);
		assert.equal(pi.sentUserMessages[0].endsWith("Run the new owner."), true);
	});
});

test("removed or workflow-colliding aliases reject stale handlers deterministically", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });
		writeWorkflowPackage(bundledRoot, { id: "alpha", alias: "shared" });

		const pi = new FakePi();
		const store = new StateStore();
		let startupCalls = 0;
		const runtime = registerWorkflowCommands(pi as any, {
			state: store,
			loadAgent: () => ({}),
			isTmuxAvailable: () => true,
			muxSetupHint: () => "start tmux",
			discoverRegistry: discoverFrom(bundledRoot, globalRoot),
			chooseStartup: async (_ctx, _definition, projectRoot) => {
				startupCalls++;
				return startupResult(projectRoot);
			},
		});
		const { ctx, notifications } = commandContext(root);

		runtime.refreshRegistry(ctx);
		const staleSharedCommand = pi.command("shared");

		writeWorkflowPackage(bundledRoot, { id: "alpha", alias: "alpha" });
		const removed = runtime.refreshRegistry(ctx);
		assert.equal(removed.aliases.shared, undefined);
		await staleSharedCommand.handler("Must not run alpha.", ctx);
		assert.match(
			notifications.at(-1)?.message ?? "",
			/alias "\/shared" is no longer available/,
		);

		writeWorkflowPackage(bundledRoot, { id: "beta", alias: "shared" });
		writeWorkflowPackage(bundledRoot, { id: "gamma", alias: "shared" });
		const collided = runtime.refreshRegistry(ctx);
		assert.equal(collided.aliases.shared, undefined);
		assert.equal(
			collided.workflowById.beta.alias.status,
			"workflow-collision",
		);
		assert.deepEqual(
			collided.workflowById.beta.alias.collidingWorkflowIds,
			["beta", "gamma"],
		);
		await staleSharedCommand.handler("Must not run a colliding owner.", ctx);
		assert.match(
			notifications.at(-1)?.message ?? "",
			/alias "\/shared" is no longer available/,
		);
		assert.equal(startupCalls, 0);
		assert.equal(pi.sentUserMessages.length, 0);
		assert.equal(getActiveWorkflowRun(store.getState()), null);
	});
});

test("post-startup command registration reaches the command registry and later collisions disable only the alias", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });

		const pi = new FakePi();
		const store = new StateStore();
		const runtime = registerWorkflowCommands(pi as any, {
			state: store,
			loadAgent: () => ({}),
			isTmuxAvailable: () => true,
			muxSetupHint: () => "start tmux",
			discoverRegistry: discoverFrom(bundledRoot, globalRoot),
			createRunId: () => "run-generic",
			chooseStartup: async (_ctx, _definition, projectRoot) =>
				startupResult(projectRoot),
		});
		const { ctx, notifications } = commandContext(root);

		runtime.refreshRegistry(ctx);
		assert.equal(
			pi.getCommands().some((command) => command.name === "docs"),
			false,
		);

		writeWorkflowPackage(bundledRoot, { id: "docs-review", alias: "docs" });
		const discovered = runtime.refreshRegistry(ctx);
		assert.equal(discovered.aliases.docs, "docs-review");
		assert.equal(
			pi.getCommands().some((command) => command.name === "docs"),
			true,
			"aliases registered after startup must be visible immediately",
		);
		const generatedDocs = pi.command("docs");

		pi.externalCommands.push({
			name: "docs",
			description: "Late extension command",
			source: "extension",
			sourceInfo: {
				path: join(root, "late-extension.ts"),
				source: "test",
				scope: "temporary",
				origin: "top-level",
			},
		});
		assert.deepEqual(
			pi.getCommands()
				.filter((command) => command.name.startsWith("docs:"))
				.map((command) => command.name),
			["docs:1", "docs:2"],
		);

		const collided = runtime.refreshRegistry(ctx);
		assert.equal(collided.aliases.docs, undefined);
		assert.equal(
			collided.workflowById["docs-review"].alias.status,
			"command-collision",
		);
		await generatedDocs.handler("Do not use the stale alias.", ctx);
		assert.match(
			notifications.at(-1)?.message ?? "",
			/alias "\/docs" is no longer available/,
		);
		assert.equal(pi.sentUserMessages.length, 0);

		await pi.command("workflow").handler(
			"run docs-review Use the generic command.",
			ctx,
		);
		assert.equal(getActiveWorkflowRun(store.getState())?.workflowId, "docs-review");
		assert.equal(pi.sentUserMessages.length, 1);
		assert.equal(
			pi.sentUserMessages[0].endsWith("Use the generic command."),
			true,
		);
	});
});

test("missing manifest agents fail before model selection and run persistence", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });
		writeWorkflowPackage(bundledRoot, {
			id: "docs-review",
			authorAgent: "missing-scribe",
			verifierAgent: "available-checker",
		});
		const pi = new FakePi();
		const store = new StateStore();
		let startupCalls = 0;
		const runtime = createWorkflowCommandRuntime(pi as any, {
			state: store,
			loadAgent: (agentName) =>
				agentName === "available-checker" ? {} : null,
			isTmuxAvailable: () => true,
			muxSetupHint: () => "start tmux",
			discoverRegistry: discoverFrom(bundledRoot, globalRoot),
			chooseStartup: async (_ctx, _definition, projectRoot) => {
				startupCalls++;
				return startupResult(projectRoot);
			},
		});
		const { ctx, notifications } = commandContext(root);
		runtime.refreshRegistry(ctx);

		assert.equal(
			await runtime.runWorkflow("docs-review", "Write the guide.", ctx),
			false,
		);
		assert.equal(startupCalls, 0);
		assert.equal(getActiveWorkflowRun(store.getState()), null);
		assert.equal(store.persisted.length, 0);
		assert.equal(pi.sentUserMessages.length, 0);
		assert.match(notifications[0]?.message ?? "", /Missing required agents: missing-scribe/);
	});
});

test("generic workflow startup validates idle state and tmux before model selection", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });
		writeWorkflowPackage(bundledRoot, { id: "docs-review" });
		let tmuxAvailable = true;
		let startupCalls = 0;
		const pi = new FakePi();
		const store = new StateStore();
		const runtime = createWorkflowCommandRuntime(pi as any, {
			state: store,
			loadAgent: () => ({}),
			isTmuxAvailable: () => tmuxAvailable,
			muxSetupHint: () => "start pi inside tmux",
			discoverRegistry: discoverFrom(bundledRoot, globalRoot),
			chooseStartup: async (_ctx, _definition, projectRoot) => {
				startupCalls++;
				return startupResult(projectRoot);
			},
		});

		const busy = commandContext(root, { idle: false });
		runtime.refreshRegistry(busy.ctx);
		assert.equal(
			await runtime.runWorkflow("docs-review", "Busy request.", busy.ctx),
			false,
		);
		assert.match(
			busy.notifications[0]?.message ?? "",
			/cannot start while the parent agent is busy/,
		);

		tmuxAvailable = false;
		const outsideTmux = commandContext(root);
		assert.equal(
			await runtime.runWorkflow("docs-review", "Tmux request.", outsideTmux.ctx),
			false,
		);
		assert.match(
			outsideTmux.notifications[0]?.message ?? "",
			/needs tmux\. start pi inside tmux/,
		);
		assert.equal(outsideTmux.notifications[0]?.level, "error");
		assert.equal(startupCalls, 0);
		assert.equal(getActiveWorkflowRun(store.getState()), null);
		assert.equal(pi.sentUserMessages.length, 0);
	});
});

test("generic run and generated aliases share startup behavior and replacement is explicitly gated", async () => {
	await withTempDir(async (root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(globalRoot, { recursive: true });
		writeWorkflowPackage(bundledRoot, { id: "docs-review", alias: "docs" });

		const makeRuntime = (confirm: boolean[] = []) => {
			const pi = new FakePi();
			const store = new StateStore();
			const ids = ["run-1", "run-2"];
			let startupCalls = 0;
			const runtime = registerWorkflowCommands(pi as any, {
				state: store,
				loadAgent: () => ({}),
				isTmuxAvailable: () => true,
				muxSetupHint: () => "start tmux",
				discoverRegistry: discoverFrom(bundledRoot, globalRoot),
				createRunId: () => ids.shift()!,
				chooseStartup: async (_ctx, _definition, projectRoot) => {
					startupCalls++;
					return startupResult(projectRoot);
				},
			});
			const context = commandContext(root, { confirm });
			runtime.refreshRegistry(context.ctx);
			return { pi, store, runtime, context, startupCalls: () => startupCalls };
		};

		const generic = makeRuntime();
		await generic.pi.command("workflow").handler(
			"run docs-review Build the deployment guide.",
			generic.context.ctx,
		);
		assert.equal(getActiveWorkflowRun(generic.store.getState())?.runId, "run-1");
		assert.equal(generic.pi.sentUserMessages.length, 1);
		assert.equal(
			generic.pi.sentUserMessages[0].endsWith("Build the deployment guide."),
			true,
		);

		const alias = makeRuntime([false, true]);
		await alias.pi.command("docs").handler(
			"Build the deployment guide.",
			alias.context.ctx,
		);
		assert.equal(alias.pi.sentUserMessages[0], generic.pi.sentUserMessages[0]);
		assert.equal(getActiveWorkflowRun(alias.store.getState())?.runId, "run-1");

		await alias.pi.command("docs").handler("Replacement rejected.", alias.context.ctx);
		assert.equal(alias.startupCalls(), 1);
		assert.equal(alias.pi.sentUserMessages.length, 1);
		assert.equal(getActiveWorkflowRun(alias.store.getState())?.runId, "run-1");

		await alias.pi.command("docs").handler("Replacement accepted.", alias.context.ctx);
		assert.equal(alias.startupCalls(), 2);
		assert.equal(alias.pi.sentUserMessages.length, 2);
		assert.equal(getActiveWorkflowRun(alias.store.getState())?.runId, "run-2");
		assert.equal(getWorkflowRunSnapshot(alias.store.getState(), "run-1")?.status, "aborted");
		assert.equal(alias.store.persisted.at(-2)?.status, "aborted");
		assert.equal(alias.store.persisted.at(-1)?.runId, "run-2");
	});
});

test("status, restoration UX, /workflow-resume, and abort use the persisted definition snapshot", async () => {
	await withTempDir(async (root) => {
		const packagePath = writeWorkflowPackage(join(root, "bundled"), {
			id: "docs-review",
			alias: "docs",
		});
		const definition = loadDefinition(packagePath);
		const store = new StateStore(startedState(root, definition));
		store.commit(
			mergeWorkflowRunData(store.getState(), "run-docs", { ticket: "DOC-99" }),
		);
		const sessionPath = join(root, "author.jsonl");
		store.commit(
			recordWorkflowRunRoleSession(
				store.getState(),
				"run-docs",
				"author",
				sessionPath,
				{ launchStatus: "running" },
			),
		);
		store.commit(
			setWorkflowRunActiveLaunch(
				store.getState(),
				"run-docs",
				{
					roleId: "author",
					sessionPath,
					status: "interrupted",
				},
			),
		);

		const pi = new FakePi();
		const renamed: string[] = [];
		const runtime = registerWorkflowCommands(pi as any, {
			state: store,
			loadAgent: () => ({}),
			isTmuxAvailable: () => true,
			muxSetupHint: () => "start tmux",
			renameTab: (title) => renamed.push(title),
			discoverRegistry: discoverFrom(join(root, "bundled"), join(root, "global")),
		});
		const { ctx, notifications } = commandContext(root);
		runtime.refreshRegistry(ctx);

		runtime.restoreActiveRunUx(ctx);
		assert.match(notifications.at(-1)?.message ?? "", /interrupted/);
		assert.ok((notifications.at(-1)?.message ?? "").includes(sessionPath));
		assert.equal(renamed.at(-1), " Workflow: docs-review");

		const directStatus = formatWorkflowRunStatus(getActiveWorkflowRun(store.getState()));
		assert.match(directStatus, /WARNING: This launch was interrupted/);
		assert.match(directStatus, /Documentation author \(author\):/);
		assert.ok(directStatus.includes(sessionPath));
		await pi.command("workflow").handler("status", ctx);
		assert.equal(notifications.at(-1)?.message, directStatus);

		await pi.command("workflow-resume").handler(
			"Continue with the updated deployment examples.",
			ctx,
		);
		assert.equal(pi.sentUserMessages.length, 1);
		assert.match(pi.sentUserMessages[0], /mode="resume"/);
		assert.match(pi.sentUserMessages[0], /- runId: "run-docs"/);
		assert.match(pi.sentUserMessages[0], /- ticket: "DOC-99"/);
		assert.match(pi.sentUserMessages[0], /status: "interrupted"/);
		assert.equal(
			pi.sentUserMessages[0].endsWith(
				"Continue with the updated deployment examples.",
			),
			true,
		);
		assert.equal(getActiveWorkflowRun(store.getState())?.runId, "run-docs");

		await pi.command("workflow").handler("abort", ctx);
		assert.equal(getActiveWorkflowRun(store.getState()), null);
		assert.equal(getWorkflowRunSnapshot(store.getState(), "run-docs")?.status, "aborted");
		await pi.command("workflow-resume").handler("", ctx);
		assert.match(notifications.at(-1)?.message ?? "", /No active workflow run/);

		const registry = runtime.getRegistry();
		assert.ok(registry);
		assert.match(formatWorkflowRegistryList(registry, () => ({})), /docs-review/);
	});
});
