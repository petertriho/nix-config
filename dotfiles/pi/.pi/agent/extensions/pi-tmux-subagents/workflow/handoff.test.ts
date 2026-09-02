import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	buildWorkflowRolloverHandoffForRole,
	buildWorkflowRolloverHandoffForRun,
	collectWorkflowReadableDataForRole,
} from "./handoff.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	startWorkflowRun,
} from "./state.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-handoff-"));
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

test("manifest-driven handoff includes only the readable data for the author role in reads order", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const readable = collectWorkflowReadableDataForRole(definition, "author", {
			hiddenBrief: "Do not reveal this planning note.",
			draftDoc: join(root, ".notes", "DRAFT.md"),
			qaNotes: "Ship only after QA signs off.",
			ticketSlug: "ENG-42",
		});
		assert.deepEqual(readable, [
			{ slotId: "ticketSlug", label: "Ticket slug", value: "ENG-42" },
			{ slotId: "draftDoc", label: "Draft doc", value: join(root, ".notes", "DRAFT.md") },
		]);

		const handoff = buildWorkflowRolloverHandoffForRole({
			definition,
			roleId: "author",
			data: {
				hiddenBrief: "Do not reveal this planning note.",
				draftDoc: join(root, ".notes", "DRAFT.md"),
				qaNotes: "Ship only after QA signs off.",
				ticketSlug: "ENG-42",
			},
			userMessage: "Tighten the intro before continuing.",
		});
		assert.match(handoff, /fresh same-role rollover/i);
		assert.match(handoff, /Continue authoring from the current draft and latest ticket context\./);
		assert.match(handoff, /- Ticket slug: ENG-42/);
		assert.match(handoff, /- Draft doc:/);
		assert.match(handoff, /Tighten the intro before continuing\./);
		assert.doesNotMatch(handoff, /QA notes/);
		assert.doesNotMatch(handoff, /Hidden brief/);
	});
});

test("manifest-driven handoff for the verifier role excludes unreadable and empty data slots", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const handoff = buildWorkflowRolloverHandoffForRole({
			definition,
			roleId: "verifier",
			data: {
				hiddenBrief: "Internal planning only.",
				draftDoc: join(root, ".notes", "DRAFT.md"),
				qaNotes: "   ",
				ticketSlug: "ENG-42",
			},
		});
		assert.match(handoff, /Verify the current draft against the saved QA notes only\./);
		assert.match(handoff, /- Draft doc:/);
		assert.doesNotMatch(handoff, /Ticket slug/);
		assert.doesNotMatch(handoff, /Hidden brief/);
		assert.doesNotMatch(handoff, /- QA notes:/);
		assert.doesNotMatch(handoff, /Latest user instruction:/);
	});
});

test("run-snapshot handoff works for arbitrary role IDs without Pter phase names", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const transition = startWorkflowRun(createWorkflowRunState(), {
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
		const snapshot = getActiveWorkflowRun(transition.state);
		assert.ok(snapshot);
		if (!snapshot) return;

		const handoff = buildWorkflowRolloverHandoffForRun({
			snapshot,
			roleId: "verifier",
			userMessage: "Continue from the last verification pass.",
		});
		assert.match(handoff, /Verify the current draft against the saved QA notes only\./);
		assert.match(handoff, /- QA notes: Check tone and facts\./);
		assert.match(handoff, /Check tone and facts\./);
		assert.doesNotMatch(handoff, /planner|task-writer|executor|reviewer/);
		assert.doesNotMatch(handoff, /Hidden brief/);
		assert.doesNotMatch(handoff, /Ticket slug/);
	});
});
