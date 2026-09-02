import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	applyWorkflowRecoveryOverride,
	chooseWorkflowStartup,
	resolveWorkflowRoleSelection,
	updateWorkflowActiveSession,
	type WorkflowStartupState,
} from "./startup.ts";
import {
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	writeWorkflowModelPreset,
	type WorkflowPresetRoles,
} from "./presets.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

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
	reasoning: true,
	thinkingLevelMap: { high: "high" },
} as Model<any>;

const PARENT = "Use the current parent model for each role launch";
const CONFIGURE = "Configure each role before starting";
const REUSE = "Reuse the saved workflow preset";
const EDIT = "Edit saved preset roles";
const CANCEL = "Cancel";
const START = "Start workflow and save these assignments";
const EDIT_ASSIGNMENTS = "Edit assignments";

function rowFor(canonical: string): (choices: string[]) => string | undefined {
	return (choices: string[]) => choices.find((label: string) => label.startsWith(canonical));
}

const echoRow = rowFor("test/echo");
const altRow = rowFor("other/alt");

function workflowManifest(id = "quill") {
	return {
		version: 1,
		id,
		command: {
			name: id,
			description: `Run the ${id} workflow`,
		},
		skill: "SKILL.md",
		data: {
			draft: {
				kind: "file",
				label: "Draft",
				constraint: {
					under: ".notes",
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
				label: "Author",
				agent: "writer",
				reads: ["ticket", "draft"],
				writes: ["file:draft"],
				handoff: "Continue authoring from the saved draft.",
			},
			{
				id: "verifier",
				label: "Verifier",
				agent: "checker",
				reads: ["draft"],
				writes: [],
				handoff: "Verify the saved draft only.",
			},
			{
				id: "publisher",
				label: "Publisher",
				agent: "publisher",
				reads: ["draft", "ticket"],
				writes: [],
				handoff: "Prepare the final publish handoff.",
			},
		],
	};
}

function writeWorkflowPackage(root: string, manifest = workflowManifest()): string {
	const packageDir = join(root, manifest.id);
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		[
			"---",
			`name: ${manifest.id}-workflow`,
			"description: Private workflow orchestration skill.",
			"---",
			"",
			`# ${manifest.id}`,
			"",
			"Use workflow tools only.",
			"",
		].join("\n"),
	);
	return packageDir;
}

function loadDefinition(packageDir: string): NormalizedWorkflowDefinition {
	const result = loadWorkflowDefinitionFromPackage(packageDir);
	assert.equal(result.status, "ok");
	return result.definition;
}

function roles(
	definition: NormalizedWorkflowDefinition,
	provider = "test",
	model = "echo",
): WorkflowPresetRoles {
	return Object.fromEntries(
		definition.roleIds.map((roleId) => [roleId, { provider, model, thinking: "off" as const }]),
	);
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
	run: (
		root: string,
		agentDir: string,
		definition: NormalizedWorkflowDefinition,
	) => Promise<void> | void,
	manifest: ReturnType<typeof workflowManifest> = workflowManifest(),
): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-startup-generic-"));
	const workflowRoot = join(root, "workflows");
	const agentDir = join(root, "agent");
	try {
		mkdirSync(workflowRoot, { recursive: true });
		const definition = loadDefinition(writeWorkflowPackage(workflowRoot, manifest));
		await run(root, agentDir, definition);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("first-time setup collects workflow assignments in manifest order and persists one complete preset", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const { ctx, remaining } = startupContext([
			CONFIGURE,
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			START,
		]);
		const result = await chooseWorkflowStartup(ctx, definition, root, {
			agentDir,
			now: () => new Date("2026-09-01T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.equal(result.state.workflowId, definition.id);
		assert.equal(result.state.policy, "per-role");
		assert.equal(result.state.assignmentSource, "configured");
		assert.deepEqual(result.state.originalAssignments, roles(definition));
		assert.deepEqual(result.state.currentAssignments, roles(definition));
		assert.deepEqual(remaining, []);

		const stored = readWorkflowModelPreset(definition, root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status === "ok") assert.deepEqual(stored.preset.roles, roles(definition));
	});
});

test("configure flow preserves the declared workflow role order in model pickers", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const { ctx, selectCalls } = startupContext([
			CONFIGURE,
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			START,
		]);
		const result = await chooseWorkflowStartup(ctx, definition, root, {
			agentDir,
			now: () => new Date("2026-09-01T12:00:00Z"),
		});
		assert.equal(result.status, "started");
		assert.deepEqual(
			selectCalls.filter((call) => call.title.startsWith("Model for ")).map((call) => call.title),
			[
				"Model for Author (1 of 3)",
				"Model for Verifier (2 of 3)",
				"Model for Publisher (3 of 3)",
			],
		);
		assert.deepEqual(
			selectCalls.filter((call) => call.title.startsWith("Thinking for ")).map((call) => call.title),
			[
				"Thinking for Author — test/echo",
				"Thinking for Verifier — test/echo",
				"Thinking for Publisher — test/echo",
			],
		);
		for (const call of selectCalls.filter((call) => call.title.startsWith("Model for "))) {
			assert.ok(!call.choices.some((label: string) => label.includes("· current")), call.title);
		}
	});
});

test("saved workflow presets can be reused or selectively edited without disturbing other roles", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(definition, root, roles(definition), new Date("2026-08-31T12:00:00Z")),
			agentDir,
		);

		const reuse = startupContext([REUSE]);
		const reused = await chooseWorkflowStartup(reuse.ctx, definition, root, { agentDir });
		assert.equal(reused.status, "started");
		if (reused.status !== "started") return;
		assert.equal(reused.state.assignmentSource, "preset");

		const edit = startupContext([EDIT, "Verifier (verifier)", altRow, "high", START], [ECHO, ALT]);
		const edited = await chooseWorkflowStartup(edit.ctx, definition, root, {
			agentDir,
			now: () => new Date("2026-09-01T12:30:00Z"),
		});
		assert.equal(edited.status, "started");
		if (edited.status !== "started") return;
		const expected = {
			...roles(definition),
			verifier: { provider: "other", model: "alt", thinking: "high" as const },
		};
		assert.equal(edited.state.assignmentSource, "preset-edited");
		assert.deepEqual(edited.state.originalAssignments, expected);
		assert.deepEqual(edited.state.currentAssignments, expected);

		const stored = readWorkflowModelPreset(definition, root, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status === "ok") {
			assert.deepEqual(stored.preset.roles.author, roles(definition).author);
			assert.deepEqual(stored.preset.roles.publisher, roles(definition).publisher);
			assert.deepEqual(stored.preset.roles.verifier, expected.verifier);
		}
	});
});

test("role edit choices remain distinct for duplicate labels, control labels, and generated-label collisions", async () => {
	const manifest = {
		...workflowManifest("choice-collisions"),
		roles: [
			{
				id: "done",
				label: "Done",
				agent: "writer",
				reads: ["ticket", "draft"],
				writes: [],
				handoff: "Continue the Done role.",
			},
			{
				id: "cancel",
				label: "Cancel",
				agent: "writer",
				reads: ["ticket", "draft"],
				writes: [],
				handoff: "Continue the Cancel role.",
			},
			{
				id: "first",
				label: "Duplicate",
				agent: "writer",
				reads: ["ticket", "draft"],
				writes: [],
				handoff: "Continue the first duplicate role.",
			},
			{
				id: "second",
				label: "Duplicate",
				agent: "writer",
				reads: ["ticket", "draft"],
				writes: [],
				handoff: "Continue the second duplicate role.",
			},
			{
				id: "generated",
				label: "Duplicate (first)",
				agent: "writer",
				reads: ["ticket", "draft"],
				writes: [],
				handoff: "Continue the generated-label role.",
			},
		],
	};

	await withTempDir(async (root, agentDir, definition) => {
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(definition, root, roles(definition), new Date("2026-08-31T12:00:00Z")),
			agentDir,
		);

		const roleChoices = [
			"Done (done)",
			"Cancel (cancel)",
			"Duplicate (first)",
			"Duplicate (second)",
			"Duplicate (first) (generated)",
		];
		const selections: Array<
			string | undefined | ((choices: string[]) => string | undefined)
		> = [EDIT];
		for (const [index, roleChoice] of roleChoices.entries()) {
			selections.push(
				roleChoice,
				altRow,
				"high",
				index === roleChoices.length - 1 ? START : EDIT_ASSIGNMENTS,
			);
		}
		const edit = startupContext(selections, [ECHO, ALT]);
		const result = await chooseWorkflowStartup(edit.ctx, definition, root, {
			agentDir,
			now: () => new Date("2026-09-01T12:30:00Z"),
		});

		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.deepEqual(
			edit.selectCalls
				.filter((call) => call.title === "Select a role to edit")
				.map((call) => call.choices),
			roleChoices.map(() => [...roleChoices, "Done", "Cancel"]),
		);
		for (const roleId of definition.roleIds) {
			assert.deepEqual(result.state.currentAssignments?.[roleId], {
				provider: "other",
				model: "alt",
				thinking: "high",
			});
		}
	}, manifest);
});

test("invalid saved role sets are ignored and unavailable saved models cannot launch until corrected", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const presetPath = join(
			agentDir,
			"state",
			"pi-tmux-subagents",
			"workflow-presets",
			"tampered.json",
		);
		mkdirSync(join(agentDir, "state", "pi-tmux-subagents", "workflow-presets"), {
			recursive: true,
		});
		writeFileSync(
			presetPath,
			JSON.stringify({
				version: 1,
				workflowId: definition.id,
				projectRoot: root,
				updatedAt: "2026-09-01T12:00:00.000Z",
				roles: {
					author: { provider: "test", model: "echo", thinking: "off" },
					verifier: { provider: "test", model: "echo", thinking: "off" },
				},
			}),
		);

		const staleRoles = {
			...roles(definition),
			publisher: { provider: "missing", model: "gone", thinking: "off" as const },
		};
		writeWorkflowModelPreset(
			makeWorkflowModelPreset(definition, root, staleRoles, new Date("2026-09-01T11:00:00Z")),
			agentDir,
		);

		const stale = startupContext([REUSE, EDIT, "Publisher (publisher)", echoRow, "off", START]);
		const result = await chooseWorkflowStartup(stale.ctx, definition, root, {
			agentDir,
			now: () => new Date("2026-09-01T12:30:00Z"),
		});
		assert.equal(result.status, "started");
		assert.equal(stale.notifications.length, 1);
		assert.match(stale.notifications[0][0], /Saved preset has unavailable assignments/);

		const fixed = readWorkflowModelPreset(definition, root, agentDir);
		assert.equal(fixed.status, "ok");
		if (fixed.status === "ok") assert.equal(fixed.preset.roles.publisher.provider, "test");
	});
});

test("role-set mismatches in the saved preset fall back to fresh choices without offering reuse", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const savedPath = readWorkflowModelPreset(definition, root, agentDir).path;
		mkdirSync(join(agentDir, "state", "pi-tmux-subagents", "workflow-presets"), {
			recursive: true,
		});
		writeFileSync(
			savedPath,
			JSON.stringify({
				version: 1,
				workflowId: definition.id,
				projectRoot: root,
				updatedAt: "2026-09-01T12:00:00.000Z",
				roles: {
					author: { provider: "test", model: "echo", thinking: "off" },
					verifier: { provider: "test", model: "echo", thinking: "off" },
				},
			}),
		);

		const mismatch = startupContext([PARENT]);
		const result = await chooseWorkflowStartup(mismatch.ctx, definition, root, { agentDir });
		assert.equal(result.status, "started");
		assert.equal(mismatch.selectCalls[0]?.choices.includes(REUSE), false);
		assert.equal(mismatch.selectCalls[0]?.choices.includes(EDIT), false);
		assert.equal(mismatch.notifications.length, 1);
		assert.match(mismatch.notifications[0][0], /exactly match workflow "quill" roles/);
	});
});

test("parent-per-role mode resolves the current parent model at each fresh role launch", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const { ctx } = startupContext([PARENT], [ECHO, ALT]);
		const result = await chooseWorkflowStartup(ctx, definition, root, { agentDir });
		assert.equal(result.status, "started");
		if (result.status !== "started") return;
		assert.equal(result.state.policy, "parent-per-role");
		assert.equal(result.state.originalAssignments, undefined);

		const first = await resolveWorkflowRoleSelection(ctx, definition, result.state, "author");
		assert.equal(first.argument, "test/echo:off");
		const changed = {
			...ctx,
			model: { ...ECHO, provider: "other", id: "new-model" },
		};
		const second = await resolveWorkflowRoleSelection(changed, definition, result.state, "publisher");
		assert.equal(second.argument, "other/new-model:off");
	});
});

test("per-role resolution revalidates current assignments before launch and recovery overrides remain separate from originals", async () => {
	await withTempDir(async (root, _agentDir, definition) => {
		const state: WorkflowStartupState = {
			workflowId: definition.id,
			policy: "per-role",
			assignmentSource: "preset",
			projectRoot: root,
			originalAssignments: roles(definition),
			currentAssignments: roles(definition),
			updatedAt: "2026-09-01T12:00:00.000Z",
		};
		const resolved = await resolveWorkflowRoleSelection(startupContext([], [ECHO, ALT]).ctx, definition, state, "verifier");
		assert.equal(resolved.argument, "test/echo:off");

		await assert.rejects(
			() => resolveWorkflowRoleSelection(startupContext([], []).ctx, definition, state, "author"),
			/not authenticated and available/,
		);

		const updated = updateWorkflowActiveSession(state, "author", "/tmp/author-1.jsonl");
		assert.equal(updated?.activeSessions?.author, "/tmp/author-1.jsonl");
		assert.equal(state.activeSessions, undefined);

		const recovered = applyWorkflowRecoveryOverride(updated!, "verifier", {
			provider: "other",
			model: "alt",
			thinking: "high",
		});
		assert.deepEqual(recovered?.originalAssignments?.verifier, roles(definition).verifier);
		assert.deepEqual(recovered?.currentAssignments?.verifier, {
			provider: "other",
			model: "alt",
			thinking: "high",
		});
		assert.equal(recovered?.activeSessions?.author, "/tmp/author-1.jsonl");
	});
});

test("workflow startup cancellation and non-interactive mode start no workflow", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const cancelled = startupContext([CANCEL]);
		assert.deepEqual(
			await chooseWorkflowStartup(cancelled.ctx, definition, root, { agentDir }),
			{ status: "cancelled", reason: "user" },
		);

		const noUi = startupContext([]);
		(noUi.ctx as any).hasUI = false;
		const result = await chooseWorkflowStartup(noUi.ctx, definition, root, { agentDir });
		assert.equal(result.status, "cancelled");
		assert.equal(readWorkflowModelPreset(definition, root, agentDir).status, "missing");
	});
});

test("final assignment confirmation handles its explicit Cancel choice without prompting again", async () => {
	await withTempDir(async (root, agentDir, definition) => {
		const cancelled = startupContext([
			CONFIGURE,
			echoRow,
			"off",
			echoRow,
			"off",
			echoRow,
			"off",
			CANCEL,
		]);
		assert.deepEqual(
			await chooseWorkflowStartup(cancelled.ctx, definition, root, { agentDir }),
			{ status: "cancelled", reason: "user" },
		);
		assert.equal(
			cancelled.selectCalls.filter((call) => call.title.startsWith("Role assignments:")).length,
			1,
		);
		assert.equal(readWorkflowModelPreset(definition, root, agentDir).status, "missing");
	});
});
