import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	loadWorkflowDefinitionFromPackage,
	parseWorkflowPrivateSkill,
	resolveWorkflowRoleWriteCapabilities,
} from "./schema.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-schema-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function writeWorkflowPackage(
	root: string,
	manifest: unknown,
	skillBody = [
		"---",
		"name: demo-workflow",
		"description: Private workflow orchestration skill.",
		"---",
		"",
		"# Workflow",
		"",
		"Use workflow tools only.",
	].join("\n"),
): string {
	const packageDir = join(root, "demo");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(join(packageDir, "SKILL.md"), `${skillBody}\n`);
	return packageDir;
}

function assertInvalid(
	result: ReturnType<typeof loadWorkflowDefinitionFromPackage>,
	expectedPath: RegExp,
	expectedMessage: RegExp,
) {
	assert.equal(result.status, "invalid");
	assert.ok(
		result.diagnostics.some((diagnostic) =>
			expectedPath.test(diagnostic.path) && expectedMessage.test(diagnostic.message)
		),
		JSON.stringify(result.diagnostics, null, 2),
	);
}

function pterLikeManifest() {
	return {
		version: 1,
		id: "pter",
		command: {
			name: "pter",
			description: "Run the plan to tasks to execute to review workflow",
			argumentHint: "<request>",
		},
		skill: "SKILL.md",
		data: {
			plan: {
				kind: "file",
				label: "PLAN.md",
				constraint: {
					under: ".artifacts",
					basename: "PLAN.md",
				},
			},
			tasks: {
				kind: "file",
				label: "TASKS.md",
				constraint: {
					under: ".artifacts",
					basename: "TASKS.md",
				},
			},
			review: {
				kind: "file",
				label: "REVIEW.md",
				constraint: {
					under: ".artifacts",
					basename: "REVIEW.md",
				},
			},
			baseRef: {
				kind: "string",
				label: "Base ref",
			},
		},
		roles: [
			{
				id: "planner",
				label: "Planner",
				agent: "planner",
				reads: ["baseRef", "plan"],
				writes: ["file:plan"],
				handoff: "Continue planning from the current plan and the user's latest adjustment.",
			},
			{
				id: "task-writer",
				label: "Task writer",
				agent: "task-writer",
				reads: ["plan", "tasks"],
				writes: ["file:tasks"],
				handoff: "Re-read the plan and tasks, then continue task writing.",
			},
			{
				id: "executor",
				label: "Executor",
				agent: "executor",
				reads: ["plan", "tasks", "review", "baseRef"],
				writes: ["worktree", "file:tasks"],
				handoff: "Continue from the first unchecked task or named review finding.",
			},
			{
				id: "reviewer",
				label: "Reviewer",
				agent: "reviewer",
				reads: ["plan", "tasks", "review", "baseRef"],
				writes: ["file:review"],
				handoff: "Review independently from the current artifacts and base ref.",
			},
		],
	};
}

test("loadWorkflowDefinitionFromPackage accepts a Pter-like manifest and deep-freezes it", () => {
	withTempDir((root) => {
		const result = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, pterLikeManifest()));
		assert.equal(result.status, "ok");
		assert.equal(result.definition.id, "pter");
		assert.deepEqual(result.definition.roleIds, ["planner", "task-writer", "executor", "reviewer"]);
		assert.deepEqual(result.definition.dataOrder, ["plan", "tasks", "review", "baseRef"]);
		assert.equal(result.definition.skill.frontmatter.name, "demo-workflow");
		assert.equal(result.definition.skill.body, "# Workflow\n\nUse workflow tools only.");
		assert.equal(Object.isFrozen(result.definition), true);
		assert.equal(Object.isFrozen(result.definition.roles), true);
		assert.equal(Object.isFrozen(result.definition.roles[0]), true);
		assert.equal(Object.isFrozen(result.definition.data.plan), true);
		assert.throws(() => {
			(result.definition.roles as unknown as Array<unknown>).push("x");
		});
		const writes = resolveWorkflowRoleWriteCapabilities(result.definition, "planner", {});
		assert.equal(writes.status, "ok");
		assert.deepEqual(writes.writes, [
			{
				capability: "file:plan",
				kind: "file",
				slotId: "plan",
				label: "PLAN.md",
				constraint: { under: ".artifacts", basename: "PLAN.md" },
			},
		]);
	});
});

test("loadWorkflowDefinitionFromPackage accepts workflows with unrelated role and data names", () => {
	withTempDir((root) => {
		const manifest = {
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
					label: "Draft",
					constraint: {
						under: ".notes",
						basename: "DRAFT.md",
					},
				},
				releaseTag: {
					kind: "string",
					label: "Release tag",
				},
			},
			roles: [
				{
					id: "author",
					label: "Author",
					agent: "writer",
					reads: ["releaseTag", "draftDoc"],
					writes: ["file:draftDoc"],
					handoff: "Continue authoring from the saved draft.",
				},
				{
					id: "verifier",
					label: "Verifier",
					agent: "checker",
					reads: ["draftDoc"],
					writes: [],
					handoff: "Verify the saved draft only.",
				},
			],
		};
		const result = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest));
		assert.equal(result.status, "ok");
		assert.deepEqual(result.definition.roleIds, ["author", "verifier"]);
		assert.equal(result.definition.roleById.author.agent, "writer");
		assert.deepEqual(result.definition.roleById.verifier.reads, ["draftDoc"]);
	});
});

test("loadWorkflowDefinitionFromPackage rejects malformed workflow JSON", () => {
	withTempDir((root) => {
		const packageDir = join(root, "broken");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(join(packageDir, "workflow.json"), "{");
		writeFileSync(join(packageDir, "SKILL.md"), "---\nname: broken\ndescription: Broken\n---\n\nBody\n");
		assertInvalid(
			loadWorkflowDefinitionFromPackage(packageDir),
			/workflow\.json$/,
			/Malformed workflow manifest JSON/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects unsupported manifest versions", () => {
	withTempDir((root) => {
		const manifest = pterLikeManifest();
		manifest.version = 2;
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#version$/,
			/Unsupported workflow manifest version 2/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects duplicate role IDs", () => {
	withTempDir((root) => {
		const manifest = pterLikeManifest();
		manifest.roles[1].id = "planner";
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#roles\[1\]\.id$/,
			/Duplicate workflow role ID "planner"/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects bad role references", () => {
	withTempDir((root) => {
		const manifest = pterLikeManifest();
		manifest.roles[0].reads = ["missing"];
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#roles\[0\]\.reads\[0\]$/,
			/reads unknown data slot "missing"/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects non-file write targets", () => {
	withTempDir((root) => {
		const manifest = pterLikeManifest();
		manifest.roles[0].writes = ["file:baseRef"];
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#roles\[0\]\.writes\[0\]$/,
			/cannot write non-file data slot "baseRef"/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects skill path traversal", () => {
	withTempDir((root) => {
		const manifest = pterLikeManifest();
		manifest.skill = "../outside.md";
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#skill$/,
			/stay inside the workflow package/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects unsafe file constraints", () => {
	withTempDir((root) => {
		const manifest = pterLikeManifest();
		manifest.data.plan.constraint.under = "../escape";
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#data\.plan\.constraint\.under$/,
			/stay inside the repository/,
		);
	});
});

test("resolveWorkflowRoleWriteCapabilities rejects writable file slots with neither value nor safe constraint", () => {
	withTempDir((root) => {
		const manifest = {
			version: 1,
			id: "scribe",
			command: {
				name: "scribe",
				description: "Generate one output artifact",
			},
			skill: "SKILL.md",
			data: {
				output: {
					kind: "file",
					label: "Output",
				},
			},
			roles: [
				{
					id: "author",
					label: "Author",
					agent: "writer",
					reads: ["output"],
					writes: ["file:output"],
					handoff: "Keep writing the output artifact.",
				},
			],
		};
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest));
		assert.equal(loaded.status, "ok");
		const unresolved = resolveWorkflowRoleWriteCapabilities(loaded.definition, "author", {});
		assert.equal(unresolved.status, "invalid");
		assert.ok(
			unresolved.diagnostics.some((diagnostic) =>
				diagnostic.path.endsWith("workflow.json#roles[0].writes[0]")
				&& /without an exact value or a safe repository-relative constraint/.test(diagnostic.message)
			),
			JSON.stringify(unresolved.diagnostics, null, 2),
		);

		const projectRoot = join(root, "project");
		mkdirSync(join(projectRoot, ".artifacts", "run"), { recursive: true });
		const resolved = resolveWorkflowRoleWriteCapabilities(
			loaded.definition,
			"author",
			{ output: join(projectRoot, ".artifacts", "run", "OUTPUT.md") },
			{ projectRoot },
		);
		assert.equal(resolved.status, "ok");
		assert.deepEqual(resolved.writes, [
			{
				capability: "file:output",
				kind: "file",
				slotId: "output",
				label: "Output",
				exactPath: join(projectRoot, ".artifacts", "run", "OUTPUT.md"),
			},
		]);
	});
});

test("resolveWorkflowRoleWriteCapabilities rejects lexical traversal and symlink escapes for nonexistent targets", () => {
	withTempDir((root) => {
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, pterLikeManifest()));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		const outsideRoot = join(root, "outside");
		mkdirSync(projectRoot);
		mkdirSync(outsideRoot);

		const lexicalEscape = resolveWorkflowRoleWriteCapabilities(
			loaded.definition,
			"planner",
			{ plan: join(projectRoot, "..", "outside", "PLAN.md") },
			{ projectRoot },
		);
		assert.equal(lexicalEscape.status, "invalid");
		assert.ok(
			lexicalEscape.diagnostics.some((diagnostic) =>
				/path must stay inside the project root/.test(diagnostic.message)
			),
			JSON.stringify(lexicalEscape.diagnostics, null, 2),
		);

		symlinkSync(outsideRoot, join(projectRoot, ".artifacts"), "dir");
		const symlinkEscape = resolveWorkflowRoleWriteCapabilities(
			loaded.definition,
			"planner",
			{ plan: join(projectRoot, ".artifacts", "missing", "PLAN.md") },
			{ projectRoot },
		);
		assert.equal(symlinkEscape.status, "invalid");
		assert.ok(
			symlinkEscape.diagnostics.some((diagnostic) =>
				/path must stay inside the project root/.test(diagnostic.message)
			),
			JSON.stringify(symlinkEscape.diagnostics, null, 2),
		);
	});
});

test("resolveWorkflowRoleWriteCapabilities accepts dotdot-prefixed root file names while rejecting parent escapes", () => {
	withTempDir((root) => {
		const manifest = {
			version: 1,
			id: "scribe",
			command: {
				name: "scribe",
				description: "Generate one output artifact",
			},
			skill: "SKILL.md",
			data: {
				output: {
					kind: "file",
					label: "Output",
				},
			},
			roles: [
				{
					id: "author",
					label: "Author",
					agent: "writer",
					reads: ["output"],
					writes: ["file:output"],
					handoff: "Keep writing the output artifact.",
				},
			],
		};
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		mkdirSync(projectRoot);

		const resolved = resolveWorkflowRoleWriteCapabilities(
			loaded.definition,
			"author",
			{ output: join(projectRoot, "..draft.md") },
			{ projectRoot },
		);
		assert.equal(resolved.status, "ok");
		assert.deepEqual(resolved.writes, [
			{
				capability: "file:output",
				kind: "file",
				slotId: "output",
				label: "Output",
				exactPath: join(projectRoot, "..draft.md"),
			},
		]);

		const escape = resolveWorkflowRoleWriteCapabilities(
			loaded.definition,
			"author",
			{ output: join(projectRoot, "..", "outside", "PLAN.md") },
			{ projectRoot },
		);
		assert.equal(escape.status, "invalid");
		assert.ok(
			escape.diagnostics.some((diagnostic) =>
				/path must stay inside the project root/.test(diagnostic.message)
			),
			JSON.stringify(escape.diagnostics, null, 2),
		);
	});
});

test("resolveWorkflowRoleWriteCapabilities canonicalizes safe symlinks for nonexistent targets", () => {
	withTempDir((root) => {
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, pterLikeManifest()));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		const artifactRoot = join(projectRoot, "artifact-storage");
		mkdirSync(artifactRoot, { recursive: true });
		symlinkSync(artifactRoot, join(projectRoot, ".artifacts"), "dir");

		const resolved = resolveWorkflowRoleWriteCapabilities(
			loaded.definition,
			"planner",
			{ plan: join(projectRoot, ".artifacts", "missing", "PLAN.md") },
			{ projectRoot },
		);
		assert.equal(resolved.status, "ok");
		assert.deepEqual(resolved.writes, [
			{
				capability: "file:plan",
				kind: "file",
				slotId: "plan",
				label: "PLAN.md",
				exactPath: join(artifactRoot, "missing", "PLAN.md"),
			},
		]);
	});
});

test("parseWorkflowPrivateSkill rejects missing description frontmatter", () => {
	const parsed = parseWorkflowPrivateSkill(
		"---\nname: private-only\n---\n\n# Workflow\n\nBody\n",
		"/tmp/private/SKILL.md",
	);
	assert.equal("status" in parsed && parsed.status === "invalid", true);
	if ("status" in parsed && parsed.status === "invalid") {
		assert.ok(
			parsed.diagnostics.some((diagnostic) =>
				diagnostic.path.endsWith("description")
				&& /non-empty `description`/.test(diagnostic.message)
			),
			JSON.stringify(parsed.diagnostics, null, 2),
		);
	}
});
