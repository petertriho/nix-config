import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	WORKFLOW_RUN_ENTRY_CUSTOM_TYPE,
	abortWorkflowRun,
	completeWorkflowRun,
	createWorkflowRunState,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	listWorkflowRunSnapshots,
	mergeWorkflowRunData,
	overrideWorkflowRunAssignment,
	persistWorkflowRunSnapshots,
	recordWorkflowRunRoleSession,
	restoreWorkflowRunStateFromBranch,
	restoreWorkflowRunStateFromSession,
	startWorkflowRun,
	summarizeWorkflowRun,
	type StartWorkflowRunInput,
	type WorkflowRunBranchReader,
	type WorkflowRunPersistTarget,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-state-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function workflowManifest(extraRole = false) {
	return {
		version: 1,
		id: "quill",
		command: {
			name: "quill",
			description: "Run the author and verifier workflow",
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
			...(extraRole
				? [{
					id: "publisher",
					label: "Publisher",
					agent: "publisher",
					reads: ["draft", "ticket"],
					writes: [],
					handoff: "Prepare the final publish handoff.",
				}]
				: []),
		],
	};
}

function writeWorkflowPackage(
	root: string,
	manifest: ReturnType<typeof workflowManifest>,
	skillBody = [
		"---",
		"name: quill-workflow",
		"description: Private workflow orchestration skill.",
		"---",
		"",
		"# Quill",
		"",
		"Use workflow tools only.",
	].join("\n"),
): string {
	const packageDir = join(root, "quill");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(join(packageDir, "SKILL.md"), `${skillBody}\n`);
	return packageDir;
}

function loadDefinition(packageDir: string): NormalizedWorkflowDefinition {
	const result = loadWorkflowDefinitionFromPackage(packageDir);
	assert.equal(result.status, "ok");
	return result.definition;
}

function capturePersistedSnapshots() {
	const appended: Array<{ customType: string; data: unknown }> = [];
	const target: WorkflowRunPersistTarget = {
		appendEntry(customType, data) {
			appended.push({ customType, data });
		},
	};
	return { target, appended };
}

function appendTransition(
	capture: ReturnType<typeof capturePersistedSnapshots>,
	transition: WorkflowRunTransitionResult,
) {
	persistWorkflowRunSnapshots(capture.target, transition.snapshots);
}

function toBranchEntries(appended: ReadonlyArray<{ customType: string; data: unknown }>): SessionEntry[] {
	let parentId: string | null = null;
	return appended.map((entry, index) => {
		const id = `entry-${index + 1}`;
		const customEntry: SessionEntry = {
			type: "custom",
			id,
			parentId,
			timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
			customType: entry.customType,
			data: entry.data,
		};
		parentId = id;
		return customEntry;
	});
}

function sessionManagerForBranch(branch: readonly SessionEntry[]): WorkflowRunBranchReader {
	return {
		getBranch: () => [...branch],
	};
}

function startInput(root: string, definition: NormalizedWorkflowDefinition, runId = "run-a"): StartWorkflowRunInput {
	return {
		runId,
		source: "project",
		definition,
		projectRoot: root,
		policy: "per-role",
		assignmentSource: "configured",
		originalAssignments: {
			author: {
				provider: "anthropic",
				model: "claude-sonnet-4",
				thinking: "low",
			},
			verifier: {
				provider: "openai",
				model: "gpt-5",
				thinking: "minimal",
			},
		},
		data: {
			draft: join(root, ".notes", "DRAFT.md"),
			ticket: "ENG-42",
		},
	};
}

test("restoreWorkflowRunStateFromSession reconstructs the latest active run snapshot from branch entries", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root, workflowManifest()));
		const capture = capturePersistedSnapshots();

		let transition = startWorkflowRun(createWorkflowRunState(), startInput(root, definition), {
			now: () => new Date("2026-09-01T11:26:03.000Z"),
		});
		appendTransition(capture, transition);
		transition = recordWorkflowRunRoleSession(transition.state, "run-a", "author", join(root, ".pi", "author-1.jsonl"), {
			launchStatus: "completed",
			now: () => new Date("2026-09-01T11:27:00.000Z"),
		});
		appendTransition(capture, transition);
		transition = mergeWorkflowRunData(transition.state, "run-a", { ticket: "ENG-99" }, {
			now: () => new Date("2026-09-01T11:28:00.000Z"),
		});
		appendTransition(capture, transition);

		assert.equal(capture.appended[0]?.customType, WORKFLOW_RUN_ENTRY_CUSTOM_TYPE);

		const restored = restoreWorkflowRunStateFromSession(
			sessionManagerForBranch(toBranchEntries(capture.appended)),
		);
		assert.deepEqual(restored.snapshots, []);
		const active = getActiveWorkflowRun(restored.state);
		assert.ok(active);
		assert.equal(active.runId, "run-a");
		assert.equal(active.data.ticket, "ENG-99");
		assert.equal(active.roleSessions.author?.current, join(root, ".pi", "author-1.jsonl"));
		assert.equal(active.activeLaunch?.status, "completed");
		assert.equal(active.updatedAt, "2026-09-01T11:28:00.000Z");
	});
});

test("active workflow snapshots preserve the original definition snapshot after the package changes", () => {
	withTempDir((root) => {
		const packageDir = writeWorkflowPackage(root, workflowManifest());
		const originalDefinition = loadDefinition(packageDir);
		const capture = capturePersistedSnapshots();

		appendTransition(
			capture,
			startWorkflowRun(createWorkflowRunState(), startInput(root, originalDefinition), {
				now: () => new Date("2026-09-01T11:26:03.000Z"),
			}),
		);

		writeWorkflowPackage(
			root,
			workflowManifest(true),
			[
				"---",
				"name: quill-workflow",
				"description: Updated private workflow orchestration skill.",
				"---",
				"",
				"# Quill v2",
				"",
				"Use new workflow tools only.",
			].join("\n"),
		);
		const updatedDefinition = loadDefinition(packageDir);
		assert.notDeepEqual(updatedDefinition.roleIds, originalDefinition.roleIds);
		assert.notEqual(updatedDefinition.skill.hash, originalDefinition.skill.hash);

		const restored = restoreWorkflowRunStateFromBranch(toBranchEntries(capture.appended));
		const active = getActiveWorkflowRun(restored.state);
		assert.ok(active);
		assert.deepEqual(active.definition.roleIds, originalDefinition.roleIds);
		assert.equal(active.definition.skill.body, originalDefinition.skill.body);
		assert.equal(active.manifestHash, originalDefinition.manifestHash);
		assert.equal(active.skillHash, originalDefinition.skill.hash);
		assert.notEqual(active.skillHash, updatedDefinition.skill.hash);
	});
});

test("workflow state rejects stale run IDs after completion and abort", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root, workflowManifest()));
		let transition = startWorkflowRun(createWorkflowRunState(), startInput(root, definition, "run-complete"));
		transition = completeWorkflowRun(transition.state, "run-complete", {
			now: () => new Date("2026-09-01T11:29:00.000Z"),
		});
		assert.throws(
			() => mergeWorkflowRunData(transition.state, "run-complete", { ticket: "ENG-100" }),
			/already completed|stale/i,
		);

		transition = startWorkflowRun(transition.state, startInput(root, definition, "run-abort"), {
			now: () => new Date("2026-09-01T11:30:00.000Z"),
		});
		transition = abortWorkflowRun(transition.state, "run-abort", {
			now: () => new Date("2026-09-01T11:31:00.000Z"),
		});
		assert.throws(
			() => recordWorkflowRunRoleSession(transition.state, "run-abort", "author", join(root, "author-2.jsonl")),
			/already aborted|stale/i,
		);
	});
});

test("workflow state enforces one active run unless the caller replaces it", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root, workflowManifest()));
		const started = startWorkflowRun(createWorkflowRunState(), startInput(root, definition, "run-a"));
		assert.throws(
			() => startWorkflowRun(started.state, startInput(root, definition, "run-b")),
			/already active/i,
		);

		const replaced = startWorkflowRun(started.state, startInput(root, definition, "run-b"), {
			replaceActive: true,
			now: () => new Date("2026-09-01T11:32:00.000Z"),
		});
		assert.equal(replaced.snapshots.length, 2);
		assert.equal(replaced.snapshots[0]?.runId, "run-a");
		assert.equal(replaced.snapshots[0]?.status, "aborted");
		assert.equal(getActiveWorkflowRun(replaced.state)?.runId, "run-b");
		assert.throws(
			() => mergeWorkflowRunData(replaced.state, "run-a", { ticket: "ENG-101" }),
			/replaced|stale/i,
		);
	});
});

test("restoring a starting or running launch marks it interrupted and preserves the role session path", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root, workflowManifest()));
		const capture = capturePersistedSnapshots();
		let transition = startWorkflowRun(createWorkflowRunState(), startInput(root, definition), {
			now: () => new Date("2026-09-01T11:26:03.000Z"),
		});
		appendTransition(capture, transition);
		transition = recordWorkflowRunRoleSession(transition.state, "run-a", "author", join(root, ".pi", "author-running.jsonl"), {
			launchStatus: "running",
			now: () => new Date("2026-09-01T11:27:00.000Z"),
		});
		appendTransition(capture, transition);

		const restored = restoreWorkflowRunStateFromBranch(toBranchEntries(capture.appended), {
			now: () => new Date("2026-09-01T11:40:00.000Z"),
		});
		assert.equal(restored.snapshots.length, 1);
		const active = getActiveWorkflowRun(restored.state);
		assert.ok(active);
		assert.equal(active.activeLaunch?.status, "interrupted");
		assert.equal(active.activeLaunch?.roleId, "author");
		assert.equal(active.activeLaunch?.sessionPath, join(root, ".pi", "author-running.jsonl"));
		assert.equal(active.roleSessions.author?.current, join(root, ".pi", "author-running.jsonl"));
		assert.equal(active.updatedAt, "2026-09-01T11:40:00.000Z");

		const summary = summarizeWorkflowRun(active);
		assert.equal(summary.active, true);
		assert.equal(summary.interrupted, true);
		assert.equal(summary.activeLaunch?.roleLabel, "Author");
		assert.equal(summary.currentRoleSessions.author, join(root, ".pi", "author-running.jsonl"));
	});
});

test("completed and aborted runs remain readable after restore but no longer count as active", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root, workflowManifest()));
		const capture = capturePersistedSnapshots();

		let transition = startWorkflowRun(createWorkflowRunState(), startInput(root, definition, "run-complete"));
		appendTransition(capture, transition);
		transition = completeWorkflowRun(transition.state, "run-complete", {
			now: () => new Date("2026-09-01T11:29:00.000Z"),
		});
		appendTransition(capture, transition);

		transition = startWorkflowRun(transition.state, startInput(root, definition, "run-abort"), {
			now: () => new Date("2026-09-01T11:30:00.000Z"),
		});
		appendTransition(capture, transition);
		transition = abortWorkflowRun(transition.state, "run-abort", {
			now: () => new Date("2026-09-01T11:31:00.000Z"),
		});
		appendTransition(capture, transition);

		const restored = restoreWorkflowRunStateFromBranch(toBranchEntries(capture.appended));
		assert.equal(getActiveWorkflowRun(restored.state), null);
		assert.equal(getWorkflowRunSnapshot(restored.state, "run-complete")?.status, "completed");
		assert.equal(getWorkflowRunSnapshot(restored.state, "run-abort")?.status, "aborted");
		assert.deepEqual(
			listWorkflowRunSnapshots(restored.state).map((snapshot) => `${snapshot.runId}:${snapshot.status}`),
			["run-complete:completed", "run-abort:aborted"],
		);
	});
});

test("recordWorkflowRunRoleSession keeps history and overrideWorkflowRunAssignment changes only current defaults", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root, workflowManifest()));
		let transition = startWorkflowRun(createWorkflowRunState(), startInput(root, definition));
		transition = recordWorkflowRunRoleSession(transition.state, "run-a", "author", join(root, ".pi", "author-1.jsonl"), {
			launchStatus: "completed",
		});
		transition = recordWorkflowRunRoleSession(transition.state, "run-a", "author", join(root, ".pi", "author-2.jsonl"), {
			launchStatus: "completed",
		});
		transition = overrideWorkflowRunAssignment(
			transition.state,
			"run-a",
			"verifier",
			{
				provider: "anthropic",
				model: "claude-opus-4",
				thinking: "medium",
			},
			{
				now: () => new Date("2026-09-01T11:35:00.000Z"),
			},
		);

		const active = getActiveWorkflowRun(transition.state);
		assert.ok(active);
		assert.equal(active.roleSessions.author?.current, join(root, ".pi", "author-2.jsonl"));
		assert.deepEqual(active.roleSessions.author?.history, [join(root, ".pi", "author-1.jsonl")]);
		assert.deepEqual(active.originalAssignments?.verifier, {
			provider: "openai",
			model: "gpt-5",
			thinking: "minimal",
		});
		assert.deepEqual(active.currentAssignments?.author, {
			provider: "anthropic",
			model: "claude-sonnet-4",
			thinking: "low",
		});
		assert.deepEqual(active.currentAssignments?.verifier, {
			provider: "anthropic",
			model: "claude-opus-4",
			thinking: "medium",
		});
	});
});
