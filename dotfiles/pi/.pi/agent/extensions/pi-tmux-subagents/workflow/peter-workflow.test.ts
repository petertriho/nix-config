import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	buildWorkflowRoleContinuation,
	buildWorkflowRolloverHandoffForRole,
	collectWorkflowReadableDataForRole,
} from "./handoff.ts";
import { discoverWorkflowRegistry } from "./registry.ts";
import { buildWorkflowRecoveryMessage } from "./recovery.ts";
import {
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	writeWorkflowModelPreset,
} from "./presets.ts";
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
	fileURLToPath(new URL("../workflows/peter/workflow.json", import.meta.url)),
);
const WORKFLOWS_ROOT = dirname(PACKAGE_ROOT);
const EXECUTION_REVIEW_SKILL = fileURLToPath(
	new URL(
		"../../../../../../agents/.agents/skills/execution-review/SKILL.md",
		import.meta.url,
	),
);

function loadPeter() {
	const loaded = loadWorkflowDefinitionFromPackage(PACKAGE_ROOT);
	assert.equal(loaded.status, "ok");
	if (loaded.status !== "ok") throw new Error("bundled Peter package did not load");
	return loaded.definition;
}

test("bundled Peter manifest declares five roles, typed data, labels, and write policy", () => {
	const definition = loadPeter();
	assert.equal(definition.id, "peter");
	assert.deepEqual(definition.command, {
		name: "peter",
		description: "Run the plan to evaluate to tasks to execute to review workflow",
		argumentHint: "<request>",
	});
	assert.deepEqual(definition.dataOrder, ["plan", "evaluation", "tasks", "review", "baseRef"]);
	assert.deepEqual(definition.roleIds, ["planner", "evaluator", "task-writer", "executor", "reviewer"]);
	assert.deepEqual(
		definition.roles.map((role) => [role.id, role.label, role.agent]),
		[
			["planner", " Planner", "planner"],
			["evaluator", " Evaluator", "evaluator"],
			["task-writer", " Task writer", "task-writer"],
			["executor", " Executor", "executor"],
			["reviewer", " Reviewer", "reviewer"],
		],
	);
	assert.deepEqual(definition.roleById.planner.writes, ["file:plan"]);
	assert.deepEqual(definition.roleById.evaluator.writes, ["file:evaluation"]);
	assert.deepEqual(definition.roleById.evaluator.reads, ["plan", "evaluation"]);
	assert.deepEqual(definition.roleById.planner.reads, ["baseRef", "plan", "evaluation"]);
	assert.deepEqual(definition.roleById["task-writer"].reads, ["plan", "tasks"]);
	assert.deepEqual(definition.roles.filter((role) => role.optional).map((role) => role.id), ["evaluator"]);
	assert.equal(definition.data.evaluation.kind, "file");
	assert.deepEqual(definition.data.evaluation.constraint, {
		under: ".artifacts",
		basename: "EVALUATION.md",
	});
	assert.deepEqual(definition.roleById["task-writer"].writes, ["file:tasks"]);
	assert.deepEqual(definition.roleById.executor.writes, ["worktree", "file:tasks"]);
	assert.deepEqual(definition.roleById.reviewer.writes, ["file:review"]);

	const projectRoot = "/tmp/peter-project";
	const values = {
		plan: join(projectRoot, ".artifacts", "demo", "PLAN.md"),
		evaluation: join(projectRoot, ".artifacts", "demo", "EVALUATION.md"),
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
		["plan", "evaluation", "tasks", "review"],
	);
});

test("Peter private skill preserves all gates and six phases using dedicated workflow lifecycle calls", () => {
	const skill = loadPeter().skill.body;
	for (const heading of [
		"## Phase 0: Git preflight",
		"## Phase 1: Plan",
		"## Phase 2: Evaluate",
		"## Phase 3: Tasks",
		"## Phase 4: Execute",
		"## Phase 5: Review",
		"## Phase 6: Approved fix pass",
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
		" Evaluating",
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
		"workflow_gate({",
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

test("Peter review scope includes untracked files without executor path bookkeeping", () => {
	const skill = loadPeter().skill.body;
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

test("Pi Peter Gate 3 offers the full verdict-blocking fix scope only with a user decision", () => {
	const skill = loadPeter().skill.body;
	const gate = skill.match(/## Gate 3:[^\n]*\n([\s\S]*?)\n## Phase 6:/)?.[1];
	assert.ok(gate, "missing Gate 3 before Phase 6");
	assertFixPassScope(gate);
	assert.match(
		gate.replace(/\s+/g, " "),
		/ask (?:the user )?whether to run one fix pass for this scope or to stop here\. Wait\./i,
	);
});

test("Pi Peter Phase 6 sends a self-contained fix scope and preserves fix-pass boundaries", () => {
	const skill = loadPeter().skill.body;
	const phase = skill.match(/## Phase 6:[^\n]*\n([\s\S]*?)\n## Gate 4:/)?.[1];
	assert.ok(phase, "missing Phase 6 before Gate 4");
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
});

function skillSection(heading: string): string {
	const skill = loadPeter().skill.body;
	const start = skill.indexOf(`## ${heading}\n`);
	assert.ok(start >= 0, `missing section ${heading}`);
	const end = skill.indexOf("\n## ", start + 3);
	return skill.slice(start, end < 0 ? undefined : end);
}

function roleInstruction(heading: string, roleId: string): string {
	const section = skillSection(heading);
	const calls = [...section.matchAll(/workflow_(?:spawn|resume)\(\{[\s\S]*?\n\s*\}\)/g)];
	const call = calls.find(([text]) => text.includes(`role: "${roleId}"`));
	assert.ok(call, `${heading} must launch ${roleId}`);
	const value = call[0].match(/(?:task|message): ("(?:[^"\\]|\\.)*")/)?.[1];
	assert.ok(value, `${heading} needs a self-contained instruction`);
	return JSON.parse(value);
}

// These are orchestration contract scenarios, not a simulated runtime state
// machine. Each checks the real skill's instructions for a user transcript
// branch; process/event behavior is exercised in plannotator.test.ts.
const scenarios: Array<{ name: string; section: string; checks: RegExp[] }> = [
	{
		name: "default evaluation runs before the plan gate",
		section: "Runtime contract",
		checks: [/Evaluation is enabled by default, including parent-model mode/, /Only an explicit saved .*"skip": true.* skips Phase 2/],
	},
	{
		name: "saved skip launches no evaluator and ignores old evaluation",
		section: "Phase 2: Evaluate",
		checks: [/Evaluation skipped by saved role assignment/, /Do not spawn, resume, or recover the evaluator/, /do not read a stale `EVALUATION.md`/, /proceed to Gate 1 with the plan alone/],
	},
	{
		name: "missing or failed evaluation requires retry or stop",
		section: "Phase 2: Evaluate",
		checks: [/successful result for this evaluation of the current plan/, /matching the exact target/, /Missing output or `NOTHING EVALUATED`/, /retry evaluation or stop/, /same plan and evaluation targets/, /status: "aborted"/, /Do not silently skip, invent findings, advance to tasking/],
	},
	{
		name: "evaluated folder gate and skipped file gate",
		section: "Gate 1: Plan review",
		checks: [/Evaluated path: `reviewDirectory: true`/, /Skipped path: `reviewDirectory: false`/, /plan status, goal, non-goals, and settled decisions/, /refuted and unverified claim counts/, /BLOCKING and NOTE/, /`NEEDS REVISION` still reaches this user gate/],
	},
	{
		name: "annotated plan is revised then re-evaluated before repeating Gate 1",
		section: "Gate 1: Plan review",
		checks: [/On `annotated` feedback or chat adjustment notes, resume the planner/, /reference material for the findings these notes name/, /do not adopt other findings, and do not edit EVALUATION.md/, /re-evaluate before repeating Gate 1/, /role: "evaluator"/, /Overwrite <absolute EVALUATION.md path> and edit nothing else/, /retry-or-stop on missing output or NOTHING EVALUATED/, /skipped path, repeat Gate 1 directly without re-evaluation/],
	},
	{
		name: "accepted evaluation findings stay out of task requirements",
		section: "Gate 1: Plan review",
		checks: [/On approval, forward any approval notes verbatim as non-blocking guidance/, /keep them for Done, not task-writing instructions/, /Do not pass `evaluation` in task-writer data or prompts/],
	},
	{
		name: "task annotations repeat Gate 2 and approval guides execution",
		section: "Gate 2: Task review",
		checks: [/gate: "tasks"/, /artifact: "tasks"/, /reviewDirectory: false/, /for a go or for task change notes, and wait/, /On `annotated` feedback or chat change notes/, /repeat this gate after its result and boundary check/, /On approval, keep any approval notes for the executor as non-blocking guidance/],
	},
	{
		name: "approved review fixes nonempty scope but finishes empty scope",
		section: "Gate 3: Review result",
		checks: [/State whether the scope is empty/, /`approved` with a non-empty scope: run Phase 6/, /`approved` with an empty scope: go to \*\*Done\*\*, without a fix pass/],
	},
	{
		name: "review annotations override standard scope including empty scope",
		section: "Gate 3: Review result",
		checks: [/`annotated`: run Phase 6/, /exclude, dispute, or add findings and override the standard scope where they conflict/, /even when the standard scope is empty/],
	},
	{
		name: "dismissed review requires a fresh explicit chat answer",
		section: "Gate 3: Review result",
		checks: [/Chat fallback: ask whether to run one fix pass for this scope or to stop here. Wait/, /`dismissed` or unavailable review: the explicit chat answer decides/, /stop goes to \*\*Done\*\* without a fix pass/],
	},
	{
		name: "Gate 4 offers resume, fresh, and stop without automatic review",
		section: "Gate 4: Re-review choice",
		checks: [/ask the user to choose exactly one/, /Resume the previous reviewer/, /Start a fresh reviewer/, /Stop without re-review/, /Wait for the answer/, /If no previous reviewer session exists/, /offer only fresh reviewer and stop/, /65% context-fit\/rollover gate/, /fresh Gate 3 decision authorizes it/],
	},
	{
		name: "approval, annotation, dismissal, and empty feedback are distinct",
		section: "Plannotator gate",
		checks: [/`approved` without feedback advances/, /`approved` with feedback advances with the notes verbatim as non-blocking guidance/, /Do not revise the reviewed artifact over approval notes/, /Empty feedback is valid/, /`annotated` forwards the feedback verbatim/, /`dismissed` asks the gate's chat fallback/],
	},
	{
		name: "failed and interrupted gates cannot authorize work",
		section: "Plannotator gate",
		checks: [/missing binary, startup failure, failed exit, missing result, invalid JSON, unknown decision, or invalid feedback type is not approval/, /An interrupted gate requires that gate's chat fallback and a fresh user decision/, /Never reconnect to an orphaned browser process/, /never act on stale or duplicate results/, /does not authorize repeating a phase that already ran/],
	},
];

for (const scenario of scenarios) {
	test(`Peter scenario contract: ${scenario.name}`, () => {
		const text = skillSection(scenario.section).replace(/\s+/g, " ");
		for (const check of scenario.checks) assert.match(text, check, scenario.name);
	});
}

test("Peter browser gates use only the native parent tool and preserve folder feedback", () => {
	const skill = loadPeter().skill.body;
	const gate = skillSection("Plannotator gate").replace(/\s+/g, " ");
	assert.equal((skill.match(/command -v plannotator/g) ?? []).length, 1);
	assert.doesNotMatch(skill, /run_in_background|plannotator annotate|nohup|setInterval/);
	assert.match(gate, /workflow_gate\(\{ runId: "<run id>", gate: "plan", artifact: "plan", reviewDirectory: true/);
	assert.match(gate, /wait for the matching `workflow_gate_result`/);
	assert.match(gate, /read the result file before process closure/);
	assert.match(gate, /<plan-name>-decisions\/.*never inside the reviewed plan directory/);
	assert.match(gate, /Do not create, reuse, or overwrite result paths yourself/);
	assert.match(gate, /per-file sections are authoritative/);
	assert.match(gate, /Forward the entire feedback unchanged.*name the files it covers/);
	assert.match(gate, /Do not trim, summarize, merge, deduplicate/);
	assert.match(gate, /read the full result after closure before forwarding/);
	assert.match(gate, /Never start a gate while a role is running/);
	assert.match(gate, /Gate 4 is always a chat choice/);
	for (const [, instruction] of skill.matchAll(/(?:task|message): ("(?:[^"\\]|\\.)*")/g)) {
		assert.match(JSON.parse(instruction), /Do not run Plannotator; the parent owns the gates/);
	}
});

test("Peter role input contracts isolate evaluation and preserve it in evaluator rollover", () => {
	const definition = loadPeter();
	const data = {
		plan: "/tmp/project/.artifacts/demo/PLAN.md",
		evaluation: "/tmp/project/.artifacts/demo/EVALUATION.md",
		tasks: "/tmp/project/.artifacts/demo/TASKS.md",
		baseRef: "main",
	};
	assert.deepEqual(
		collectWorkflowReadableDataForRole(definition, "task-writer", data).map((entry) => entry.slotId),
		["plan", "tasks"],
	);
	const task = roleInstruction("Phase 3: Tasks", "task-writer");
	assert.doesNotMatch(task, /EVALUATION|evaluation/);
	const rollover = buildWorkflowRolloverHandoffForRole({
		definition,
		roleId: "evaluator",
		data,
		userMessage: roleInstruction("Gate 1: Plan review", "evaluator"),
	});
	assert.match(rollover, /fresh same-role rollover/);
	assert.ok(rollover.includes(data.plan));
	assert.ok(rollover.includes(data.evaluation));
	assert.match(rollover, /Overwrite <absolute EVALUATION.md path> and edit nothing else/);
	assert.match(rollover, /read-only/);
});

test("Peter real prompt templates preserve multiline feedback through continuation, recovery, and rollover", () => {
	const definition = loadPeter();
	const started = startWorkflowRun(createWorkflowRunState(), {
		runId: "feedback-run",
		source: "bundled",
		definition,
		projectRoot: "/tmp/project",
		policy: "parent-per-role",
		assignmentSource: "parent",
	});
	const snapshot = getActiveWorkflowRun(started.state);
	assert.ok(snapshot);
	const folderNotes = " \n# Folder Feedback\nKeep  spacing.\n\n# Linked Document Feedback\n## /tmp/project/.artifacts/demo/PLAN.md\nUse $& literally.\n## /tmp/project/.artifacts/demo/EVALUATION.md\nAccept NOTE-2.\n\t ";
	for (const feedback of [folderNotes, "", " \n\t "]) {
		for (const [heading, roleId] of [
			["Gate 1: Plan review", "planner"],
			["Gate 2: Task review", "task-writer"],
		]) {
			const instruction = roleInstruction(heading, roleId)
				.replace("<verbatim notes>", () => feedback);
			const continued = buildWorkflowRoleContinuation({
				opening: "Continue.",
				role: definition.roleById[roleId],
				dataSlots: definition.data,
				data: {},
				userMessage: instruction,
			});
			const recovered = buildWorkflowRecoveryMessage({ snapshot, roleId, userMessage: instruction });
			const rolled = buildWorkflowRolloverHandoffForRole({ definition, roleId, data: {}, userMessage: instruction });
			for (const output of [instruction, continued, recovered, rolled]) {
				assert.equal(output.match(/<user-feedback>([\s\S]*?)<\/user-feedback>/)?.[1], feedback);
			}
		}
	}
	const fix = skillSection("Phase 6: Approved fix pass").replace(/\s+/g, " ");
	assert.match(fix, /User annotations on REVIEW.md.*override the standard scope where they conflict: <user-feedback><verbatim feedback><\/user-feedback>/);
	assert.match(fix, /Preserve this exact scope and feedback through any recovery or rollover/);
	assert.match(skillSection("Role failure and recovery"), /feedback block verbatim/);
});

test("Peter approval and fix annotations retain verbatim notes with the authorized scope", () => {
	const definition = loadPeter();
	const notes = "\n  Keep this exact guidance.  \n\n\t";
	for (const [heading, roleId] of [
		["Phase 3: Tasks", "task-writer"],
		["Phase 4: Execute", "executor"],
		["Phase 6: Approved fix pass", "executor"],
	]) {
		const section = skillSection(heading);
		const guidance = section.match(/`(Approval notes \(non-blocking[\s\S]*?<\/user-feedback>)`/)?.[1];
		assert.ok(guidance, `${heading} needs its approval-note template`);
		const instruction = `${roleInstruction(heading, roleId)}\n${guidance.replace("<verbatim notes>", () => notes)}`;
		const rollover = buildWorkflowRolloverHandoffForRole({ definition, roleId, data: {}, userMessage: instruction });
		assert.equal(rollover.match(/<user-feedback>([\s\S]*?)<\/user-feedback>/)?.[1], notes);
		if (heading.startsWith("Phase 6")) assertFixPassScope(rollover);
	}
	const section = skillSection("Phase 6: Approved fix pass");
	const annotationTemplate = section.match(/`(User annotations on REVIEW.md[\s\S]*?<\/user-feedback>)`/)?.[1];
	assert.ok(annotationTemplate);
	const userMessage = `${roleInstruction("Phase 6: Approved fix pass", "executor")}\n`
		+ annotationTemplate.replace("<verbatim feedback>", () => notes);
	const rollover = buildWorkflowRolloverHandoffForRole({ definition, roleId: "executor", data: {}, userMessage });
	assertFixPassScope(rollover);
	assert.match(rollover, /override the standard scope where they conflict/);
	assert.equal(rollover.match(/<user-feedback>([\s\S]*?)<\/user-feedback>/)?.[1], notes);
});

test("Peter uses a separate five-role preset and never imports or modifies historical Pter presets", () => {
	const root = mkdtempSync(join(tmpdir(), "peter-preset-isolation-"));
	try {
		const agentDir = join(root, "agent");
		const selection = { provider: "test", model: "echo", thinking: "off" as const };
		const legacyPath = writeWorkflowModelPreset({
			version: 1,
			workflowId: "pter", // Deliberately historical, not a current alias.
			projectRoot: root,
			updatedAt: "2026-09-01T12:00:00.000Z",
			roles: {
				planner: selection,
				"task-writer": selection,
				executor: selection,
				reviewer: selection,
			},
		}, agentDir);
		const legacyBytes = readFileSync(legacyPath, "utf8");
		const definition = loadPeter();
		const before = readWorkflowModelPreset(definition, root, agentDir);
		assert.equal(before.status, "missing");
		assert.notEqual(before.path, legacyPath);
		const currentPath = writeWorkflowModelPreset(makeWorkflowModelPreset(definition, root, {
			planner: selection,
			evaluator: { skip: true },
			"task-writer": selection,
			executor: selection,
			reviewer: selection,
		}), agentDir);
		assert.notEqual(currentPath, legacyPath);
		const current = readWorkflowModelPreset(definition, root, agentDir);
		assert.equal(current.status, "ok");
		assert.deepEqual(current.preset.roles.evaluator, { skip: true });
		assert.equal(readFileSync(legacyPath, "utf8"), legacyBytes);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("bundled discovery exposes only /peter and private startup uses the package snapshot", () => {
	const emptyGlobal = mkdtempSync(join(tmpdir(), "peter-empty-global-"));
	try {
		const registry = discoverWorkflowRegistry({
			bundledRoot: WORKFLOWS_ROOT,
			globalRoot: emptyGlobal,
			projectTrusted: false,
			existingCommands: [],
		});
		assert.equal(registry.aliases.peter, "peter");
		assert.equal(registry.aliases.pter, undefined, "no compatibility alias");
		assert.equal(registry.workflowById.pter, undefined, "no bundled legacy package");
		assert.equal(existsSync(join(WORKFLOWS_ROOT, "pter", "workflow.json")), false);
		assert.equal(registry.workflowById.peter.source, "bundled");
		assert.equal(registry.workflowById.peter.packagePath, PACKAGE_ROOT);
		assert.match(registry.workflowById.peter.skillPath, /workflows\/peter\/SKILL\.md$/);

		const started = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-peter",
			source: "bundled",
			definition: registry.workflowById.peter.definition,
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
			/^<skill name="peter-workflow" location=".*workflows\/peter\/SKILL\.md">/,
		);
		assert.match(message, /id="planner".*agent="planner"/);
		assert.match(message, /id="evaluator".*agent="evaluator"/);
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
				path: "/tmp/peter-workflow.test.ts",
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

function makePeterRuntime(root: string) {
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

test("/workflow run peter and generated /peter produce equivalent startup messages and state", async () => {
	const root = mkdtempSync(join(tmpdir(), "peter-runtime-equivalence-"));
	try {
		const request = "Migrate the package without changing behavior.";
		const generic = makePeterRuntime(root);
		await generic.pi.command("workflow").handler(`run peter ${request}`, generic.ctx);

		const alias = makePeterRuntime(root);
		await alias.pi.command("peter").handler(request, alias.ctx);
		assert.equal(alias.pi.commands.some((command) => command.name === "pter"), false);

		assert.equal(generic.pi.messages.length, 1);
		assert.deepEqual(alias.pi.messages, generic.pi.messages);
		assert.equal(getActiveWorkflowRun(generic.store.getState())?.workflowId, "peter");
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
