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
const CLAUDE_PTER_SKILL = fileURLToPath(
	new URL(
		"../../../../../../claude/.claude/skills/pter/SKILL.md",
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

function assertFixPassScope(instruction: string) {
	const text = instruction.replace(/`/g, "").replace(/\s+/g, " ");
	assert.match(text, /every independently verdict-blocking findings? regardless of severity/);
	assert.match(text, /every CRITICAL and HIGH finding/);
	assert.match(text, /current acceptance not met for a checked \(\[x\]\) task/);
	assert.match(text, /implemented non-goals/);
	assert.match(text, /reversed settled decisions/);
	assert.match(
		text,
		/Exclude ordinary MEDIUM and INFO findings and unverified acceptance alone/,
	);
	assert.match(text, /Do not inflate severity/);
}

for (const [variant, skillPath] of [
	["Pi", join(PACKAGE_ROOT, "SKILL.md")],
	["Claude", CLAUDE_PTER_SKILL],
]) {
	test(`${variant} Pter Gate 3 offers the full verdict-blocking fix scope only with approval`, () => {
		const skill = readFileSync(skillPath, "utf8");
		const gate = skill.match(/## Gate 3:[^\n]*\n([\s\S]*?)\n## Phase 5:/)?.[1];
		assert.ok(gate, "missing Gate 3 before Phase 5");
		assertFixPassScope(gate);
		assert.match(
			gate.replace(/\s+/g, " "),
			/Ask (?:the user )?whether to run one fix pass for this scope or to stop here\. Wait\./,
		);
	});

	test(`${variant} Pter Phase 5 sends a self-contained fix scope and preserves fix-pass boundaries`, () => {
		const skill = readFileSync(skillPath, "utf8");
		const phase = skill.match(/## Phase 5:[^\n]*\n([\s\S]*?)\n## Gate 4:/)?.[1];
		assert.ok(phase, "missing Phase 5 before Gate 4");
		const message = phase.match(/message: "([^"\n]+)"/)?.[1];
		assert.ok(message, "missing executor message");
		assertFixPassScope(message);
		assert.match(message, /in <absolute REVIEW\.md path>/);
		assert.match(message, /Keep TASKS\.md checkboxes accurate/);
		assert.match(message, /Never stage or commit/);
		assert.match(message, /Report what changed and every validation command with its result/);
		assert.match(
			phase.replace(/\s+/g, " "),
			/Gate 4[.;] [Nn]ever re-review automatically/,
		);
		if (variant === "Claude") {
			assert.match(
				phase.replace(/\s+/g, " "),
				/If the continuation fails, spawn a fresh executor with the same fix-pass message, the artifact paths, and the base ref/,
			);
		}
	});
}

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
