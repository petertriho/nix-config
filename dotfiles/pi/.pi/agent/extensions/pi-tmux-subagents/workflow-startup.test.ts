import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import {
	applyWorkflowRecoveryOverride,
	buildWorkflowMetadata,
	chooseWorkflowStartup,
	resolveWorkflowPhaseSelection,
	updateWorkflowActiveSession,
	workflowPhaseForAgent,
	type WorkflowRuntimeState,
} from "./workflow-startup.ts";
import {
	type WorkflowPresetRoles,
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	writeWorkflowModelPreset,
} from "./workflow-preset.ts";

const ECHO = {
	provider: "test",
	id: "echo",
	name: "Echo",
	api: "openai-responses",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 16_000,
} as Model<any>;

const ALT = {
	...ECHO,
	provider: "other",
	id: "alt",
	name: "Alt",
} as Model<any>;

const PARENT = "Use the current parent model for each phase";
const CONFIGURE = "Configure each role before planning";
const REUSE = "Reuse the saved project preset";
const EDIT = "Edit saved preset roles";
const CANCEL = "Cancel";
const START = "Start workflow and save these assignments";

/** Respond with the model row for a canonical provider/model, marker or not. */
function rowFor(canonical: string): (choices: string[]) => string | undefined {
	return (choices: string[]) => choices.find((label: string) => label.startsWith(canonical));
}
const echoRow = rowFor("test/echo");
const altRow = rowFor("other/alt");

function roles(provider = "test", model = "echo"): WorkflowPresetRoles {
	return {
		planner: { provider, model, thinking: "off" },
		taskWriter: { provider, model, thinking: "off" },
		executor: { provider, model, thinking: "off" },
		reviewer: { provider, model, thinking: "off" },
	};
}

function startupContext(
	selections: Array<string | undefined | ((choices: string[]) => string | undefined)>,
	available = [ECHO],
) {
	const queue = [...selections];
	const notifications: Array<[string, string]> = [];
	const selectCalls: Array<{ title: string; choices: string[] }> = [];
	return {
		ctx: {
			hasUI: true,
			ui: {
				select: async (title: string, choices: string[]) => {
					selectCalls.push({ title, choices });
					const respond = queue.shift();
					return typeof respond === "function" ? respond(choices) : respond;
				},
				notify: (message: string, level: "info" | "warning" | "error") => {
					notifications.push([message, level]);
				},
			},
			scopedModels: [],
			modelRegistry: { getAvailable: () => available },
			model: ECHO,
			thinkingLevel: "off",
		} as any,
		notifications,
		remaining: queue,
		selectCalls,
	};
}

async function withTempDir(
	run: (root: string, agentDir: string) => Promise<void> | void,
): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-startup-"));
	const agentDir = join(root, "agent");
	try {
		mkdirSync(root, { recursive: true });
		await run(root, agentDir);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("first-time setup collects all four assignments and persists one complete preset", async () => {
	await withTempDir(async (root, agentDir) => {
		const { ctx, remaining } = startupContext([
			CONFIGURE,
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			START,
		]);
		const result = await chooseWorkflowStartup(ctx, root, {
			agentDir,
			now: () => new Date("2026-08-27T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.equal(result.state.policy, "per-role");
		assert.equal(result.state.assignmentSource, "configured");
		assert.deepEqual(result.state.roleAssignments, roles());
		assert.deepEqual(result.state.currentAssignments, roles());
		assert.deepEqual(remaining, []);
		const stored = readWorkflowModelPreset(root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status === "ok") assert.deepEqual(stored.preset.roles, roles());
	});
});

test("configure flow titles each role picker with its label and progress counter", async () => {
	await withTempDir(async (root, agentDir) => {
		const { ctx, selectCalls } = startupContext([
			CONFIGURE,
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			START,
		]);
		const result = await chooseWorkflowStartup(ctx, root, {
			agentDir,
			now: () => new Date("2026-08-27T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		assert.deepEqual(
			selectCalls.filter((call) => call.title.startsWith("Model for ")).map((call) => call.title),
			[
				"Model for Planner (1 of 4)",
				"Model for Task writer (2 of 4)",
				"Model for Executor (3 of 4)",
				"Model for Reviewer (4 of 4)",
			],
		);
		assert.deepEqual(
			selectCalls.filter((call) => call.title.startsWith("Thinking for ")).map((call) => call.title),
			[
				"Thinking for Planner — test/echo",
				"Thinking for Task writer — test/echo",
				"Thinking for Executor — test/echo",
				"Thinking for Reviewer — test/echo",
			],
		);
		// The configure flow runs only on an empty baseline (saved presets go
		// through the edit flow instead), so its pickers never mark a current model.
		for (const call of selectCalls.filter((call) => call.title.startsWith("Model for "))) {
			assert.ok(!call.choices.some((label: string) => label.includes("· current")), call.title);
		}
	});
});

test("edit-flow picker titles carry the selected role and mark its current model", async () => {
	await withTempDir(async (root, agentDir) => {
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(root, roles(), new Date("2026-08-26T12:00:00Z")),
			agentDir,
		);
		const { ctx, selectCalls } = startupContext(
			[EDIT, "Reviewer", altRow, "off", START],
			[ECHO, ALT],
		);
		const result = await chooseWorkflowStartup(ctx, root, {
			agentDir,
			now: () => new Date("2026-08-27T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		const modelCall = selectCalls.find((call) => call.title === "Model for Reviewer");
		assert.ok(modelCall, JSON.stringify(selectCalls.map((call) => call.title)));
		// The Reviewer's current selection (test/echo:off) marks only that row.
		assert.ok(
			modelCall.choices.find((label: string) => label.startsWith("test/echo"))?.includes("· current"),
			modelCall.choices.join("\n"),
		);
		assert.ok(
			!modelCall.choices.find((label: string) => label.startsWith("other/alt"))?.includes("· current"),
		);
		assert.ok(selectCalls.some((call) => call.title === "Thinking for Reviewer — other/alt"));
	});
});

test("a saved preset is offered for full reuse without rewriting it", async () => {
	await withTempDir(async (root, agentDir) => {
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(root, roles(), new Date("2026-08-26T12:00:00Z")),
			agentDir,
		);
		const { ctx } = startupContext([REUSE]);
		const result = await chooseWorkflowStartup(ctx, root, { agentDir });
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.equal(result.state.assignmentSource, "preset");
		const stored = readWorkflowModelPreset(root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status === "ok") {
			assert.equal(stored.preset.updatedAt, "2026-08-26T12:00:00.000Z");
		}
	});
});

test("selective preset editing changes one role and preserves the other three", async () => {
	await withTempDir(async (root, agentDir) => {
		const saved = roles();
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(root, saved, new Date("2026-08-26T12:00:00Z")),
			agentDir,
		);
		const { ctx } = startupContext(
			[EDIT, "Reviewer", altRow, "off", START],
			[ECHO, ALT],
		);
		const result = await chooseWorkflowStartup(ctx, root, {
			agentDir,
			now: () => new Date("2026-08-27T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.equal(result.state.assignmentSource, "preset-edited");
		const expected: WorkflowPresetRoles = {
			...saved,
			reviewer: { provider: "other", model: "alt", thinking: "off" },
		};
		assert.deepEqual(result.state.roleAssignments, expected);
		assert.deepEqual(result.state.currentAssignments, expected);
		const stored = readWorkflowModelPreset(root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status === "ok") assert.deepEqual(stored.preset.roles, expected);
	});
});

test("editing assignments again preserves all earlier role changes", async () => {
	await withTempDir(async (root, agentDir) => {
		const saved = roles();
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(root, saved, new Date("2026-08-26T12:00:00Z")),
			agentDir,
		);
		const { ctx, remaining } = startupContext(
			[
				EDIT,
				"Planner",
				altRow,
				"off",
				"Edit assignments",
				"Reviewer",
				altRow,
				"off",
				START,
			],
			[ECHO, ALT],
		);
		const result = await chooseWorkflowStartup(ctx, root, {
			agentDir,
			now: () => new Date("2026-08-27T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		const expected: WorkflowPresetRoles = {
			...saved,
			planner: { provider: "other", model: "alt", thinking: "off" },
			reviewer: { provider: "other", model: "alt", thinking: "off" },
		};
		assert.equal(result.state.assignmentSource, "preset-edited");
		assert.deepEqual(result.state.roleAssignments, expected);
		assert.deepEqual(result.state.currentAssignments, expected);
		assert.deepEqual(remaining, []);
		const stored = readWorkflowModelPreset(root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status === "ok") assert.deepEqual(stored.preset.roles, expected);
	});
});

test("stale saved models stay visible and require correction before launch", async () => {
	await withTempDir(async (root, agentDir) => {
		const stale = roles();
		stale.executor = { provider: "missing", model: "gone", thinking: "off" };
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(root, stale, new Date("2026-08-26T12:00:00Z")),
			agentDir,
		);
		const { ctx, notifications } = startupContext([
			REUSE,
			EDIT,
			"Executor",
			echoRow,
			"off",
			START,
		]);
		const result = await chooseWorkflowStartup(ctx, root, {
			agentDir,
			now: () => new Date("2026-08-27T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		assert.equal(notifications.length, 1);
		assert.match(notifications[0][0], /unavailable assignments/);
		const stored = readWorkflowModelPreset(root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status !== "ok") return;
		assert.equal(stored.preset.roles.executor.provider, "test");
		assert.equal(stored.preset.roles.planner.provider, "test");
	});
});

test("parent-per-phase mode resolves the current parent model at each phase", async () => {
	await withTempDir(async (root, agentDir) => {
		const { ctx } = startupContext([PARENT]);
		const result = await chooseWorkflowStartup(ctx, root, { agentDir });
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.equal(result.state.policy, "parent-per-phase");
		assert.equal(result.state.roleAssignments, undefined);

		const first = await resolveWorkflowPhaseSelection(ctx, result.state, "planner");
		assert.equal(first.argument, "test/echo:off");
		const changed = {
			...ctx,
			model: { ...ECHO, provider: "other", id: "new-model" },
		};
		const second = await resolveWorkflowPhaseSelection(changed, result.state, "reviewer");
		assert.equal(second.argument, "other/new-model:off");
	});
});

test("per-role resolution revalidates the role assignment before launch", async () => {
	const state: WorkflowRuntimeState = {
		policy: "per-role",
		assignmentSource: "preset",
		projectRoot: "/tmp/project",
		roleAssignments: roles(),
		currentAssignments: roles(),
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
	const { ctx } = startupContext([]);
	const resolved = await resolveWorkflowPhaseSelection(ctx, state, "task-writer");
	assert.equal(resolved.argument, "test/echo:off");
	await assert.rejects(
		() => resolveWorkflowPhaseSelection(startupContext([], []).ctx, state, "planner"),
		/not authenticated and available/,
	);
});

test("workflow metadata keeps original and current role defaults separate", () => {
	const state: WorkflowRuntimeState = {
		policy: "per-role",
		assignmentSource: "preset",
		projectRoot: "/tmp/project",
		roleAssignments: roles(),
		currentAssignments: roles("recovered", "replacement"),
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
	const metadata = buildWorkflowMetadata(state, "executor", {
		model: ECHO,
		selection: { provider: "recovered", model: "replacement", thinking: "off" },
		argument: "recovered/replacement:off",
		source: "picker",
	});
	assert.equal(metadata.phase, "executor");
	assert.deepEqual(metadata.originalDefault, state.roleAssignments?.executor);
	assert.deepEqual(metadata.currentDefault, { provider: "recovered", model: "replacement", thinking: "off" });
});

test("startup cancellation and non-interactive mode start no workflow", async () => {
	await withTempDir(async (root, agentDir) => {
		const canceled = startupContext([CANCEL]);
		assert.deepEqual(
			await chooseWorkflowStartup(canceled.ctx, root, { agentDir }),
			{ status: "cancelled", reason: "user" },
		);

		const noUi = startupContext([]);
		(noUi.ctx as any).hasUI = false;
		const result = await chooseWorkflowStartup(noUi.ctx, root, { agentDir });
		assert.equal(result.status, "cancelled");
		assert.equal(readWorkflowModelPreset(root, agentDir).status, "missing");
	});
});

test("workflow phases map from bundled agent names", () => {
	assert.equal(workflowPhaseForAgent("planner"), "planner");
	assert.equal(workflowPhaseForAgent("task-writer"), "task-writer");
	assert.equal(workflowPhaseForAgent("executor"), "executor");
	assert.equal(workflowPhaseForAgent("reviewer"), "reviewer");
	assert.equal(workflowPhaseForAgent("worker"), undefined);
});

test("updateWorkflowActiveSession records the latest phase session without mutating state", () => {
	const state: WorkflowRuntimeState = {
		policy: "per-role",
		assignmentSource: "preset",
		projectRoot: "/tmp/project",
		roleAssignments: roles(),
		currentAssignments: roles(),
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
	const first = updateWorkflowActiveSession(state, "executor", "/tmp/impl-1.jsonl");
	assert.notEqual(first, state);
	assert.equal(first?.activeSessions?.executor, "/tmp/impl-1.jsonl");
	assert.equal(state.activeSessions, undefined);

	// A rollover replacement replaces the phase's active session path.
	const second = updateWorkflowActiveSession(first!, "executor", "/tmp/impl-2.jsonl");
	assert.equal(second?.activeSessions?.executor, "/tmp/impl-2.jsonl");
	assert.equal(second?.roleAssignments, state.roleAssignments);

	assert.equal(updateWorkflowActiveSession(null, "planner", "/tmp/p.jsonl"), null);
});

test("applyWorkflowRecoveryOverride replaces only the recovered role's current default", () => {
	const state: WorkflowRuntimeState = {
		policy: "per-role",
		assignmentSource: "preset",
		projectRoot: "/tmp/project",
		roleAssignments: roles(),
		currentAssignments: roles(),
		activeSessions: { executor: "/tmp/impl-1.jsonl" },
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
	const recovered = applyWorkflowRecoveryOverride(state, "executor", {
		provider: "other",
		model: "replacement",
		thinking: "high",
	});
	assert.ok(recovered);
	assert.equal(recovered.roleAssignments, state.roleAssignments);
	assert.deepEqual(recovered.roleAssignments?.executor, {
		provider: "test",
		model: "echo",
		thinking: "off",
	});
	assert.deepEqual(recovered.currentAssignments?.executor, {
		provider: "other",
		model: "replacement",
		thinking: "high",
	});
	assert.deepEqual(recovered.currentAssignments?.reviewer, roles().reviewer);
	// Existing active session tracking survives the override.
	assert.equal(recovered.activeSessions?.executor, "/tmp/impl-1.jsonl");
	assert.notEqual(recovered.updatedAt, state.updatedAt);
	assert.equal(applyWorkflowRecoveryOverride(null, "reviewer", {
		provider: "a",
		model: "b",
	}), null);
});

test("a recovery override becomes the role default for later fresh sessions in per-role mode", async () => {
	const state: WorkflowRuntimeState = {
		policy: "per-role",
		assignmentSource: "preset",
		projectRoot: "/tmp/project",
		roleAssignments: roles(),
		currentAssignments: roles(),
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
	const recovered = applyWorkflowRecoveryOverride(state, "executor", {
		provider: "other",
		model: "replacement",
		thinking: "high",
	})!;

	const replacement = { ...ECHO, provider: "other", id: "replacement", reasoning: true };
	const { ctx } = startupContext([], [replacement, ECHO]);
	// Later fresh sessions of the recovered role use the recovered default.
	const resolved = await resolveWorkflowPhaseSelection(ctx, recovered, "executor");
	assert.equal(resolved.argument, "other/replacement:high");

	// Other roles keep their startup assignments.
	const reviewer = await resolveWorkflowPhaseSelection(startupContext([], [replacement, ECHO]).ctx, recovered, "reviewer");
	assert.equal(reviewer.argument, "test/echo:off");
});

test("a recovery override pins one role in parent-per-phase mode without pinning others", async () => {
	const base: WorkflowRuntimeState = {
		policy: "parent-per-phase",
		assignmentSource: "parent",
		projectRoot: "/tmp/project",
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
	const recovered = applyWorkflowRecoveryOverride(base, "reviewer", {
		provider: "other",
		model: "replacement",
		thinking: "medium",
	})!;

	const replacement = { ...ECHO, provider: "other", id: "replacement", reasoning: true };
	const { ctx } = startupContext([], [replacement, ECHO]);
	// The recovered role keeps its override for the remainder of the workflow.
	const reviewer = await resolveWorkflowPhaseSelection(ctx, recovered, "reviewer");
	assert.equal(reviewer.argument, "other/replacement:medium");

	// Fresh phases without an override still resolve the current parent model.
	const plannerCtx = startupContext([], [replacement, ECHO]);
	const planner = await resolveWorkflowPhaseSelection(plannerCtx.ctx, recovered, "planner");
	assert.equal(planner.argument, "test/echo:off");

	const changed = { ...ctx, model: { ...ECHO, provider: "third", id: "model" } };
	const taskWriter = await resolveWorkflowPhaseSelection(changed, recovered, "task-writer");
	assert.equal(taskWriter.argument, "third/model:off");
});
