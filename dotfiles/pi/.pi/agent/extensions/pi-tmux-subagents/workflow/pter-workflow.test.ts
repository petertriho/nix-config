import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverWorkflowRegistry } from "./registry.ts";
import {
	buildWorkflowSkillMessage,
	registerWorkflowCommands,
	type WorkflowCommandStateStore,
} from "./runtime.ts";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	startWorkflowRun,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import { resolveWorkflowWritePolicy } from "./write-policy.ts";

const PACKAGE_ROOT = dirname(
	fileURLToPath(new URL("../workflows/pter/workflow.json", import.meta.url)),
);
const WORKFLOWS_ROOT = dirname(PACKAGE_ROOT);
const EXECUTION_REVIEW_SKILL = fileURLToPath(
	new URL(
		"../../../../../../agents/.agents/skills/execution-review/SKILL.md",
		import.meta.url,
	),
);

function loadPter() {
	const loaded = loadWorkflowDefinitionFromPackage(PACKAGE_ROOT);
	assert.equal(loaded.status, "ok");
	if (loaded.status !== "ok") throw new Error("bundled Pter package did not load");
	return loaded.definition;
}

test("bundled Pter manifest declares the preserved roles, typed data, labels, and write policy", () => {
	const definition = loadPter();
	assert.equal(definition.id, "pter");
	assert.deepEqual(definition.command, {
		name: "pter",
		description: "Run the plan to tasks to execute to review workflow",
		argumentHint: "<request>",
	});
	assert.deepEqual(definition.dataOrder, ["plan", "tasks", "review", "baseRef"]);
	assert.deepEqual(definition.roleIds, ["planner", "task-writer", "executor", "reviewer"]);
	assert.deepEqual(
		definition.roles.map((role) => [role.id, role.label, role.agent]),
		[
			["planner", " Planner", "planner"],
			["task-writer", " Task writer", "task-writer"],
			["executor", " Executor", "executor"],
			["reviewer", " Reviewer", "reviewer"],
		],
	);
	assert.deepEqual(definition.roleById.planner.writes, ["file:plan"]);
	assert.deepEqual(definition.roleById["task-writer"].writes, ["file:tasks"]);
	assert.deepEqual(definition.roleById.executor.writes, ["worktree", "file:tasks"]);
	assert.deepEqual(definition.roleById.reviewer.writes, ["file:review"]);

	const projectRoot = "/tmp/pter-project";
	const values = {
		plan: join(projectRoot, ".artifacts", "demo", "PLAN.md"),
		tasks: join(projectRoot, ".artifacts", "demo", "TASKS.md"),
		review: join(projectRoot, ".artifacts", "demo", "REVIEW.md"),
		baseRef: "abc123",
	};
	const executor = resolveWorkflowWritePolicy(
		definition,
		"executor",
		values,
		{ projectRoot },
	);
	assert.equal(executor.status, "ok");
	if (executor.status !== "ok") return;
	assert.deepEqual(
		executor.policy.resolvedWrites.map((write) => write.capability),
		["worktree", "file:tasks"],
	);
	assert.deepEqual(
		executor.policy.protectedFiles.map((file) => file.slotId),
		["plan", "tasks", "review"],
	);
});

test("Pter private skill preserves all gates and behavior while using only dedicated workflow lifecycle calls", () => {
	const skill = loadPter().skill.body;
	for (const heading of [
		"## Phase 0: Git preflight",
		"## Gate 1: Plan review",
		"## Gate 2: Task review",
		"## Gate 3: Review result",
		"## Gate 4: Re-review choice",
		"## Done",
	]) {
		assert.ok(skill.includes(heading), `missing ${heading}`);
	}
	for (const behavior of [
		"git rev-parse HEAD",
		"git status --porcelain",
		"ls -t .artifacts",
		"resume the executor exactly once",
		"CRITICAL",
		"HIGH",
		"MEDIUM",
		"INFO",
		"Resume the previous reviewer",
		"Start a fresh reviewer",
		"Stop without re-review",
		" Planning",
		" Tasking",
		" Executing",
		" Reviewing",
		" Workflow done",
		"nothing was staged or committed",
		"Include untracked files in the base-ref scope",
		"attribution limit is accepted",
	]) {
		assert.ok(skill.includes(behavior), `missing preserved behavior: ${behavior}`);
	}
	for (const tool of [
		"workflow_spawn({",
		"workflow_resume({",
		"workflow_recover",
		"workflow_complete({",
	]) {
		assert.ok(skill.includes(tool), `missing dedicated lifecycle tool ${tool}`);
	}
	assert.doesNotMatch(skill, /\bsubagent_resume\s*\(\{/);
	assert.doesNotMatch(skill, /(?:^|\n)\s*subagent\s*\(\{/);
	assert.doesNotMatch(skill, /sessionPath\s*:/);
	assert.match(skill, /status: "aborted"/);
	assert.match(skill, /status: "completed"/);
	assert.match(skill, /WORKFLOW WRITE POLICY VIOLATION/);
	assert.match(skill, /Never re-review automatically/);
});

test("Pter review scope includes untracked files without executor path bookkeeping", () => {
	const skill = loadPter().skill.body;
	const executionReview = readFileSync(EXECUTION_REVIEW_SKILL, "utf8");

	assert.doesNotMatch(skill, /workflowWriteBoundary\.allowedPaths|implementationPaths/);
	assert.match(
		executionReview,
		/git-diff-scope --ref "\$base" --include-untracked --pretty/,
	);
	assert.match(executionReview, /changes that existed\s+before implementation/);
});

test("bundled discovery exposes /pter as the manifest alias and private startup uses the package snapshot", () => {
	const emptyGlobal = mkdtempSync(join(tmpdir(), "pter-empty-global-"));
	try {
		const registry = discoverWorkflowRegistry({
			bundledRoot: WORKFLOWS_ROOT,
			globalRoot: emptyGlobal,
			projectTrusted: false,
			existingCommands: [],
		});
		assert.equal(registry.aliases.pter, "pter");
		assert.equal(registry.workflowById.pter.source, "bundled");
		assert.equal(registry.workflowById.pter.packagePath, PACKAGE_ROOT);
		assert.match(registry.workflowById.pter.skillPath, /workflows\/pter\/SKILL\.md$/);

		const started = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-pter",
			source: "bundled",
			definition: registry.workflowById.pter.definition,
			projectRoot: "/tmp/project",
			policy: "parent-per-role",
			assignmentSource: "parent",
		});
		const snapshot = getActiveWorkflowRun(started.state);
		assert.ok(snapshot);
		const request = "Implement the exact request.\nKeep this line.";
		const message = buildWorkflowSkillMessage(snapshot, request);
		assert.match(
			message,
			/^<skill name="pter-workflow" location=".*workflows\/pter\/SKILL\.md">/,
		);
		assert.match(message, /id="planner".*agent="planner"/);
		assert.match(message, /id="baseRef" kind=string label="Base ref"/);
		assert.match(message, /workflow_complete: MUST be called exactly once/);
		assert.equal(message.endsWith(request), true);
	} finally {
		rmSync(emptyGlobal, { recursive: true, force: true });
	}
});

class StateStore implements WorkflowCommandStateStore {
	state: WorkflowRunState = createWorkflowRunState();

	getState(): WorkflowRunState {
		return this.state;
	}

	commit(transition: WorkflowRunTransitionResult): void {
		this.state = transition.state;
	}
}

class FakePi {
	readonly commands: Array<{ name: string; handler: (args: string, ctx: any) => Promise<void> }> = [];
	readonly messages: string[] = [];

	registerCommand(name: string, command: any): void {
		this.commands.push({ name, ...command });
	}

	getCommands(): any[] {
		return this.commands.map((command) => ({
			name: command.name,
			source: "extension",
			sourceInfo: {
				path: "/tmp/pter-workflow.test.ts",
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

function commandContext(root: string) {
	return {
		cwd: root,
		hasUI: true,
		isIdle: () => true,
		isProjectTrusted: () => false,
		sessionManager: {
			getSessionFile: () => join(root, "parent.jsonl"),
		},
		ui: {
			notify() {},
			confirm: async () => false,
			select: async () => undefined,
		},
	} as any;
}

function makePterRuntime(root: string) {
	const pi = new FakePi();
	const store = new StateStore();
	const emptyGlobal = join(root, "global");
	const runtime = registerWorkflowCommands(pi as any, {
		state: store,
		loadAgent: () => ({}),
		isTmuxAvailable: () => true,
		muxSetupHint: () => "start tmux",
		createRunId: () => "run-equivalent",
		discoverRegistry: (ctx, existingCommands) =>
			discoverWorkflowRegistry({
				bundledRoot: WORKFLOWS_ROOT,
				globalRoot: emptyGlobal,
				projectRoot: ctx.cwd,
				projectTrusted: false,
				existingCommands,
			}),
		chooseStartup: async (_ctx, definition, projectRoot) => ({
			status: "started",
			state: {
				workflowId: definition.id,
				policy: "parent-per-role",
				assignmentSource: "parent",
				projectRoot,
				updatedAt: "2026-09-01T12:00:00.000Z",
			},
		}),
	});
	const ctx = commandContext(root);
	runtime.refreshRegistry(ctx);
	return { pi, store, ctx };
}

test("/workflow run pter and generated /pter produce equivalent startup messages and state", async () => {
	const root = mkdtempSync(join(tmpdir(), "pter-runtime-equivalence-"));
	try {
		const request = "Migrate the package without changing behavior.";
		const generic = makePterRuntime(root);
		await generic.pi.command("workflow").handler(`run pter ${request}`, generic.ctx);

		const alias = makePterRuntime(root);
		await alias.pi.command("pter").handler(request, alias.ctx);

		assert.equal(generic.pi.messages.length, 1);
		assert.deepEqual(alias.pi.messages, generic.pi.messages);
		assert.equal(getActiveWorkflowRun(generic.store.getState())?.workflowId, "pter");
		const genericSnapshot = getActiveWorkflowRun(generic.store.getState());
		const aliasSnapshot = getActiveWorkflowRun(alias.store.getState());
		assert.ok(genericSnapshot);
		assert.ok(aliasSnapshot);
		assert.deepEqual(
			{
				...aliasSnapshot,
				startedAt: genericSnapshot.startedAt,
				updatedAt: genericSnapshot.updatedAt,
			},
			genericSnapshot,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
