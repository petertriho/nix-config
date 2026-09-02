import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	RECOVERY_SELECT_MODEL,
	RECOVERY_STOP,
	applyWorkflowRunRecoveryOverride,
	buildProviderFailureRecord,
	buildWorkflowRecoveryLabels,
	buildWorkflowRecoveryMessage,
	classifyProviderFailure,
	defaultWorkflowRecoveryMessage,
	formatFailureKind,
	formatModelSelection,
	formatWorkflowRecoverySummary,
	resolveWorkflowRecoverySessionPath,
	shouldOpenRecoveryGate,
} from "./recovery.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	recordWorkflowRunRoleSession,
	startWorkflowRun,
} from "./state.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-recovery-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function workflowManifest() {
	return {
		version: 1,
		id: "quill",
		command: {
			name: "quill",
			description: "Run the author and verifier workflow",
		},
		skill: "SKILL.md",
		data: {
			draftDoc: {
				kind: "file",
				label: "Draft doc",
				constraint: {
					under: ".notes",
					basename: "DRAFT.md",
				},
			},
			ticketSlug: {
				kind: "string",
				label: "Ticket slug",
			},
			qaNotes: {
				kind: "string",
				label: "QA notes",
			},
			hiddenBrief: {
				kind: "string",
				label: "Hidden brief",
			},
		},
		roles: [
			{
				id: "author",
				label: "Author",
				agent: "writer",
				reads: ["ticketSlug", "draftDoc"],
				writes: ["file:draftDoc"],
				handoff: "Continue authoring from the current draft and latest ticket context.",
			},
			{
				id: "verifier",
				label: "Verifier",
				agent: "checker",
				reads: ["draftDoc", "qaNotes"],
				writes: [],
				handoff: "Verify the current draft against the saved QA notes only.",
			},
		],
	};
}

function writeWorkflowPackage(root: string): string {
	const packageDir = join(root, "quill");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), `${JSON.stringify(workflowManifest(), null, 2)}\n`);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		[
			"---",
			"name: quill-workflow",
			"description: Private workflow orchestration skill.",
			"---",
			"",
			"# Quill",
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

test("generic recovery labels and summaries use the manifest role label and current role session", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const started = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-quill",
			source: "project",
			definition,
			projectRoot: root,
			policy: "per-role",
			assignmentSource: "preset",
			originalAssignments: {
				author: { provider: "test", model: "echo", thinking: "off" },
				verifier: { provider: "test", model: "echo", thinking: "off" },
			},
			currentAssignments: {
				author: { provider: "test", model: "echo", thinking: "off" },
				verifier: { provider: "test", model: "echo", thinking: "off" },
			},
			data: {
				draftDoc: join(root, ".notes", "DRAFT.md"),
				ticketSlug: "ENG-42",
				qaNotes: "Check tone and facts.",
				hiddenBrief: "Do not expose.",
			},
		});
		const sessionPath = join(root, ".pi", "verifier-1.jsonl");
		const recoveredState = recordWorkflowRunRoleSession(
			started.state,
			"run-quill",
			"verifier",
			sessionPath,
			{ launchStatus: "failed" },
		).state;
		const snapshot = getActiveWorkflowRun(recoveredState);
		assert.ok(snapshot);
		if (!snapshot) return;

		const labels = buildWorkflowRecoveryLabels(snapshot, "verifier");
		assert.deepEqual(labels, {
			roleId: "verifier",
			roleLabel: "Verifier",
			pickerSubject: "Verifier recovery",
			pickerTitle: "Resume model for Verifier recovery",
			gatePrompt: "Recover the Verifier role?",
			sessionPath,
		});
		assert.equal(resolveWorkflowRecoverySessionPath(snapshot, "verifier"), sessionPath);

		const summary = formatWorkflowRecoverySummary({
			snapshot,
			roleId: "verifier",
			failureKind: "usage",
			failure: "You exceeded your current quota",
			provider: "test-provider",
			model: "echo",
			estimate: {
				tokens: 150_000,
				usageTokens: 149_900,
				trailingTokens: 100,
				source: "usage+estimate",
			},
		});
		assert.match(summary, /Workflow Verifier role failed — quota\/usage exhaustion\./);
		assert.ok(summary.includes(sessionPath));
		assert.match(summary, /Provider\/model: test-provider\/echo/);
		assert.match(summary, /Context estimate: 150,000 tokens \(usage\+estimate\)/);
		assert.doesNotMatch(summary, /planner phase|task writer phase|executor phase|reviewer phase/);
	});
});

test("generic recovery continuation uses manifest handoff text and only readable data", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const started = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-quill",
			source: "project",
			definition,
			projectRoot: root,
			policy: "per-role",
			assignmentSource: "configured",
			originalAssignments: {
				author: { provider: "test", model: "echo", thinking: "off" },
				verifier: { provider: "test", model: "echo", thinking: "off" },
			},
			data: {
				draftDoc: join(root, ".notes", "DRAFT.md"),
				ticketSlug: "ENG-99",
				qaNotes: "Check tone and facts.",
				hiddenBrief: "Do not expose.",
			},
		});
		const snapshot = getActiveWorkflowRun(started.state);
		assert.ok(snapshot);
		if (!snapshot) return;

		const message = buildWorkflowRecoveryMessage({
			snapshot,
			roleId: "author",
			userMessage: "Finish the executive summary first.",
		});
		assert.match(message, /A provider failure interrupted the Author role\./);
		assert.match(message, /Do not redo completed work/);
		assert.match(message, /Continue authoring from the current draft and latest ticket context\./);
		assert.match(message, /- Ticket slug: ENG-99/);
		assert.match(message, /- Draft doc:/);
		assert.match(message, /Finish the executive summary first\./);
		assert.doesNotMatch(message, /QA notes/);
		assert.doesNotMatch(message, /Hidden brief/);
	});
});

test("recovery overrides change only the active run assignment, not the saved preset or original assignment", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const savedPreset = {
			author: { provider: "test", model: "echo", thinking: "off" as const },
			verifier: { provider: "test", model: "echo", thinking: "off" as const },
		};
		const started = startWorkflowRun(createWorkflowRunState(), {
			runId: "run-quill",
			source: "project",
			definition,
			projectRoot: root,
			policy: "per-role",
			assignmentSource: "preset",
			originalAssignments: savedPreset,
			currentAssignments: savedPreset,
			data: {
				draftDoc: join(root, ".notes", "DRAFT.md"),
				ticketSlug: "ENG-99",
			},
		});

		const updated = applyWorkflowRunRecoveryOverride(
			started.state,
			"run-quill",
			"verifier",
			{ provider: "other", model: "alt", thinking: "high" },
		);
		const snapshot = getActiveWorkflowRun(updated.state);
		assert.ok(snapshot);
		if (!snapshot) return;

		assert.deepEqual(snapshot.originalAssignments?.verifier, {
			provider: "test",
			model: "echo",
			thinking: "off",
		});
		assert.deepEqual(snapshot.currentAssignments?.verifier, {
			provider: "other",
			model: "alt",
			thinking: "high",
		});
		assert.deepEqual(savedPreset.verifier, {
			provider: "test",
			model: "echo",
			thinking: "off",
		});
	});
});

test("provider-failure classification and recovery gate exports remain stable in the generic module", () => {
	assert.equal(classifyProviderFailure("monthly quota exhausted"), "usage");
	assert.equal(classifyProviderFailure("429 overloaded after retries"), "retry-exhausted");
	assert.equal(classifyProviderFailure("invalid x-api-key"), "other");
	assert.equal(formatFailureKind("usage"), "quota/usage exhaustion");
	assert.equal(shouldOpenRecoveryGate("usage"), true);
	assert.equal(shouldOpenRecoveryGate("other"), false);
	assert.equal(formatModelSelection({ provider: "a", model: "b", thinking: "high" }), "a/b:high");
	assert.equal(formatModelSelection({ provider: "a", model: "b" }), "a/b");
	assert.equal(formatModelSelection(undefined), "unknown");
	assert.equal(RECOVERY_SELECT_MODEL, "Select a replacement model and thinking level");
	assert.equal(RECOVERY_STOP, "Stop recovery");
	assert.match(defaultWorkflowRecoveryMessage("Verifier role"), /Verifier role/);

	const record = buildProviderFailureRecord({
		kind: "usage",
		message: "You exceeded your current quota",
		provider: "test-provider",
		model: "echo",
		recordedAt: new Date("2026-08-29T12:00:00Z"),
	});
	assert.deepEqual(record, {
		kind: "usage",
		message: "You exceeded your current quota",
		provider: "test-provider",
		model: "echo",
		recordedAt: "2026-08-29T12:00:00.000Z",
	});
});
