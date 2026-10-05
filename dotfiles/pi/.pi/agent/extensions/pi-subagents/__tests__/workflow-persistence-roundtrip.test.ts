import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { loadWorkflowDefinitionFromPackage } from "../workflow/schema.ts";
import { buildWorkflowSkillMessage, formatWorkflowRunStatus } from "../workflow/runtime.ts";
import { resolveWorkflowRecoverySessionPath } from "../workflow/recovery.ts";
import {
	abortWorkflowRun,
	completeWorkflowRun,
	createWorkflowRunState,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	mergeWorkflowRunData,
	persistWorkflowRunSnapshots,
	recordWorkflowRunRoleSession,
	restoreWorkflowRunStateFromSession,
	startWorkflowRun,
} from "../workflow/state.ts";

function withTempDir<T>(run: (root: string) => T): T {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-roundtrip-"));
	try { return run(root); }
	finally { rmSync(root, { recursive: true, force: true }); }
}

function definitionAt(root: string, roleId = "author", slotId = "draft") {
	const packagePath = join(root, "workflow");
	mkdirSync(packagePath, { recursive: true });
	writeFileSync(join(packagePath, "workflow.json"), JSON.stringify({
		version: 1, id: "quill",
		command: { name: "quill", description: "Write a draft." },
		skill: "SKILL.md",
		data: { [slotId]: { kind: "file", label: "Draft", constraint: { under: ".notes", basename: "DRAFT.md" } } },
		roles: [{ id: roleId, label: "Author", agent: "writer", reads: [slotId], handoff: "Continue writing." }],
	}));
	writeFileSync(join(packagePath, "SKILL.md"), "---\nname: quill\ndescription: Write a draft.\n---\n\nWrite the draft.\n");
	const loaded = loadWorkflowDefinitionFromPackage(packagePath);
	assert.equal(loaded.status, "ok");
	return loaded.definition;
}

function persistedSession(root: string) {
	const manager = SessionManager.create(root, join(root, "sessions"));
	// A conversation message makes Pi publish the session file.
	manager.appendMessage({ role: "user", content: "Write a draft.", timestamp: Date.now() });
	return {
		manager,
		target: { appendEntry: (customType: string, data?: unknown) => { manager.appendCustomEntry(customType, data); } },
		reopen: () => SessionManager.open(manager.getSessionFile()!),
	};
}

test("completed workflow survives a constrained symlink artifact persistence round trip", () => {
	withTempDir((root) => {
		const definition = definitionAt(root);
		const storage = join(root, "artifact-storage");
		mkdirSync(storage);
		symlinkSync(storage, join(root, ".notes"), "dir");
		const saved = persistedSession(root);
		let transition = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-a", source: "project", definition, projectRoot: root,
			policy: "parent-per-role", assignmentSource: "parent",
		});
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);
		transition = mergeWorkflowRunData(transition.state, "run-a", { draft: join(root, ".notes", "missing", "DRAFT.md") });
		assert.equal(getActiveWorkflowRun(transition.state)?.data.draft, join(storage, "missing", "DRAFT.md"));
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);
		transition = recordWorkflowRunRoleSession(transition.state, "run-a", "author", join(root, "author.jsonl"), {
			launchStatus: "completed",
		});
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);
		transition = completeWorkflowRun(transition.state, "run-a");
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);

		const restored = restoreWorkflowRunStateFromSession(saved.reopen());
		assert.equal(getActiveWorkflowRun(restored.state), null);
		assert.equal(getWorkflowRunSnapshot(restored.state, "run-a")?.status, "completed");
		assert.deepEqual(restored.state, transition.state);
		assert.deepEqual(restored.snapshots, []);
	});
});

test("declared constructor IDs render missing assignments, data, and sessions as absent", () => {
	withTempDir((root) => {
		const definition = definitionAt(root, "constructor", "constructor");
		const transition = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-a", source: "project", definition, projectRoot: root,
			policy: "per-role", assignmentSource: "parent", currentAssignments: {},
		});
		const snapshot = getActiveWorkflowRun(transition.state)!;
		const message = buildWorkflowSkillMessage(snapshot, "Continue.");
		assert.match(message, /- constructor: unavailable/);
		assert.match(message, /Current workflow data:\n- \(none yet\)/);
		assert.match(message, /Current role sessions:\n- \(none yet\)/);
		assert.match(formatWorkflowRunStatus(snapshot), /- constructor: unavailable/);
		assert.equal(Object.getPrototypeOf(snapshot.roleSessions), Object.prototype);
		assert.equal(Object.getPrototypeOf(snapshot.currentAssignments), Object.prototype);
	});
});

test("constructor role declarations require an own role map entry on startup and reload", () => {
	withTempDir((root) => {
		const definition = { ...definitionAt(root, "constructor"), roleById: {} };
		const input = {
			runId: "run-a", source: "project" as const, definition, projectRoot: root,
			policy: "parent-per-role" as const, assignmentSource: "parent" as const,
		};
		assert.throws(() => startWorkflowRun(createWorkflowRunState(), input), /roleById is missing "constructor"/);
		const valid = startWorkflowRun(createWorkflowRunState(), {
			...input, definition: definitionAt(root, "constructor"),
		});
		const saved = persistedSession(root);
		saved.manager.appendCustomEntry("pi-agent-teams.workflow-run", {
			...valid.snapshots[0], definition,
		});
		assert.equal(getActiveWorkflowRun(restoreWorkflowRunStateFromSession(saved.reopen()).state), null);
	});
});

test("constructor role sessions ignore inherited records and preserve explicit history on reload", () => {
	withTempDir((root) => {
		const definition = definitionAt(root, "constructor", "constructor");
		let transition = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-a", source: "project", definition, projectRoot: root,
			policy: "per-role", assignmentSource: "configured",
			originalAssignments: { constructor: { provider: "test", model: "echo" } },
			data: { constructor: join(root, ".notes", "DRAFT.md") },
		});
		const snapshot = {
			...getActiveWorkflowRun(transition.state)!,
			roleSessions: Object.create({ constructor: { current: "inherited.jsonl", history: ["inherited-old.jsonl"] } }),
		};
		assert.equal(resolveWorkflowRecoverySessionPath(snapshot, "constructor"), undefined);
		transition = recordWorkflowRunRoleSession({
			...transition.state, runsById: { "run-a": snapshot },
		}, "run-a", "constructor", join(root, "first.jsonl"), { launchStatus: "completed" });
		assert.deepEqual(getActiveWorkflowRun(transition.state)!.roleSessions["constructor" as string].history, []);
		transition = recordWorkflowRunRoleSession(
			transition.state, "run-a", "constructor", join(root, "second.jsonl"), { launchStatus: "completed" },
		);
		assert.deepEqual(getActiveWorkflowRun(transition.state)!.roleSessions["constructor" as string].history, [join(root, "first.jsonl")]);
		const saved = persistedSession(root);
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);
		const restored = restoreWorkflowRunStateFromSession(saved.reopen());
		assert.deepEqual(restored.state, transition.state);
		assert.equal(resolveWorkflowRecoverySessionPath(getActiveWorkflowRun(restored.state)!, "constructor"), join(root, "second.jsonl"));
		assert.equal(Object.getPrototypeOf(getActiveWorkflowRun(restored.state)!.roleSessions), Object.prototype);
	});
});

test("aborted workflow with a symlink project root retains canonical artifacts on reload", () => {
	withTempDir((root) => {
		const project = join(root, "project");
		const alias = join(root, "project-alias");
		mkdirSync(project);
		symlinkSync(project, alias, "dir");
		const definition = definitionAt(project);
		const saved = persistedSession(root);
		let transition = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-a", source: "project", definition, projectRoot: alias,
			policy: "parent-per-role", assignmentSource: "parent",
		});
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);
		transition = mergeWorkflowRunData(transition.state, "run-a", { draft: join(alias, ".notes", "DRAFT.md") });
		assert.equal(getActiveWorkflowRun(transition.state)?.data.draft, join(project, ".notes", "DRAFT.md"));
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);
		transition = abortWorkflowRun(transition.state, "run-a");
		persistWorkflowRunSnapshots(saved.target, transition.snapshots);

		const restored = restoreWorkflowRunStateFromSession(saved.reopen());
		assert.equal(getActiveWorkflowRun(restored.state), null);
		assert.equal(getWorkflowRunSnapshot(restored.state, "run-a")?.status, "aborted");
		assert.deepEqual(restored.state, JSON.parse(JSON.stringify(transition.state)));
	});
});

test("historical terminal snapshots with lexical symlink artifacts remain readable", () => {
	withTempDir((root) => {
		const definition = definitionAt(root);
		const storage = join(root, "artifact-storage");
		mkdirSync(storage);
		symlinkSync(storage, join(root, ".notes"), "dir");
		const lexical = join(root, ".notes", "DRAFT.md");
		const started = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-a", source: "project", definition, projectRoot: root,
			policy: "parent-per-role", assignmentSource: "parent", data: { draft: lexical },
		});
		const completed = completeWorkflowRun(started.state, "run-a");
		const historical = JSON.parse(JSON.stringify(completed.snapshots[0]));
		delete historical.providerId;
		historical.data.draft = lexical;
		const saved = persistedSession(root);
		saved.manager.appendCustomEntry("pi-agent-teams.workflow-run", historical);
		const restored = restoreWorkflowRunStateFromSession(saved.reopen());
		assert.equal(getActiveWorkflowRun(restored.state), null);
		const snapshot = getWorkflowRunSnapshot(restored.state, "run-a")!;
		assert.equal(snapshot.status, "completed");
		assert.equal(snapshot.providerId, "pi-agent-teams");
		assert.equal(snapshot.data.draft, join(storage, "DRAFT.md"));
		assert.equal(snapshot.definition.manifestHash, definition.manifestHash);
	});
});
