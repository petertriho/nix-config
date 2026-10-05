import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	loadWorkflowDefinitionFromPackage,
	parseWorkflowPrivateSkill,
	normalizeWorkflowDataValues,
	WorkflowRoleSchema,
} from "../workflow/schema.ts";
import { Value } from "typebox/value";

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

function exampleManifest() {
	return {
		version: 1,
		id: "example",
		command: {
			name: "example",
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
				handoff: "Continue planning from the current plan and the user's latest adjustment.",
			},
			{
				id: "task-writer",
				label: "Task writer",
				agent: "task-writer",
				reads: ["plan", "tasks"],
				handoff: "Re-read the plan and tasks, then continue task writing.",
			},
			{
				id: "executor",
				label: "Executor",
				agent: "executor",
				reads: ["plan", "tasks", "review", "baseRef"],
				handoff: "Continue from the first unchecked task or named review finding.",
			},
			{
				id: "reviewer",
				label: "Reviewer",
				agent: "reviewer",
				reads: ["plan", "tasks", "review", "baseRef"],
				handoff: "Review independently from the current artifacts and base ref.",
			},
		],
	};
}

test("role optional flag accepts booleans only in both schema and package normalization", () => {
	withTempDir((root) => {
		for (const optional of [true, false, undefined, "true", 1, null, {}]) {
			const manifest = exampleManifest();
			const role = { ...manifest.roles[0], ...(optional !== undefined ? { optional } : {}) };
			const valid = optional === undefined || typeof optional === "boolean";
			assert.equal(Value.Check(WorkflowRoleSchema, role), valid);
			const result = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, {
				...manifest,
				roles: [role, ...manifest.roles.slice(1)],
			}));
			if (valid) {
				assert.equal(result.status, "ok");
				assert.equal(result.definition.roleById.planner.optional, optional);
				assert.equal(result.definition.roleById.reviewer.optional, undefined);
			} else {
				assertInvalid(result, /roles\[0\]\.optional/, /must be a boolean/);
			}
		}
	});
});

test("loadWorkflowDefinitionFromPackage accepts a multi-role manifest and deep-freezes it", () => {
	withTempDir((root) => {
		const result = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, exampleManifest()));
		assert.equal(result.status, "ok");
		assert.equal(result.definition.id, "example");
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
					handoff: "Continue authoring from the saved draft.",
				},
				{
					id: "verifier",
					label: "Verifier",
					agent: "checker",
					reads: ["draftDoc"],
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
		const manifest = exampleManifest();
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
		const manifest = exampleManifest();
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
		const manifest = exampleManifest();
		manifest.roles[0].reads = ["missing"];
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#roles\[0\]\.reads\[0\]$/,
			/reads unknown data slot "missing"/,
		);
	});
});

test("workflow manifests reject undeclared role fields", () => {
	withTempDir((root) => {
		const manifest = exampleManifest();
		const role = { ...manifest.roles[0], writes: ["file:plan"] };
		assert.equal(Value.Check(WorkflowRoleSchema, role), false);
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, {
				...manifest,
				roles: [role, ...manifest.roles.slice(1)],
			})),
			/workflow\.json#roles\[0\]$/,
			/Workflow roles must contain/,
		);
	});
});

test("loadWorkflowDefinitionFromPackage rejects skill path traversal", () => {
	withTempDir((root) => {
		const manifest = exampleManifest();
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
		const manifest = exampleManifest();
		manifest.data.plan.constraint.under = "../escape";
		assertInvalid(
			loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest)),
			/workflow\.json#data\.plan\.constraint\.under$/,
			/stay inside the repository/,
		);
	});
});

test("file slots without constraints accept a project-contained value", () => {
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
					handoff: "Keep writing the output artifact.",
				},
			],
		};
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest));
		assert.equal(loaded.status, "ok");
		const unresolved = normalizeWorkflowDataValues(loaded.definition, {});
		assert.equal(unresolved.status, "ok");

		const projectRoot = join(root, "project");
		mkdirSync(join(projectRoot, ".artifacts", "run"), { recursive: true });
		const resolved = normalizeWorkflowDataValues(
			loaded.definition,
			{ output: join(projectRoot, ".artifacts", "run", "OUTPUT.md") },
			{ projectRoot },
		);
		assert.equal(resolved.status, "ok");
		assert.equal(resolved.values.output, join(projectRoot, ".artifacts", "run", "OUTPUT.md"));
	});
});

test("workflow data rejects lexical traversal and symlink escapes for nonexistent targets", () => {
	withTempDir((root) => {
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, exampleManifest()));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		const outsideRoot = join(root, "outside");
		mkdirSync(projectRoot);
		mkdirSync(outsideRoot);

		const lexicalEscape = normalizeWorkflowDataValues(
			loaded.definition,
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
		const symlinkEscape = normalizeWorkflowDataValues(
			loaded.definition,
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

test("workflow data accepts dotdot-prefixed root file names while rejecting parent escapes", () => {
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
					handoff: "Keep writing the output artifact.",
				},
			],
		};
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		mkdirSync(projectRoot);

		const resolved = normalizeWorkflowDataValues(
			loaded.definition,
			{ output: join(projectRoot, "..draft.md") },
			{ projectRoot },
		);
		assert.equal(resolved.status, "ok");
		assert.equal(resolved.values.output, join(projectRoot, "..draft.md"));

		const escape = normalizeWorkflowDataValues(
			loaded.definition,
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

test("workflow data canonicalizes safe symlinks for nonexistent targets", () => {
	withTempDir((root) => {
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, exampleManifest()));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		const artifactRoot = join(projectRoot, "artifact-storage");
		mkdirSync(artifactRoot, { recursive: true });
		symlinkSync(artifactRoot, join(projectRoot, ".artifacts"), "dir");

		const resolved = normalizeWorkflowDataValues(
			loaded.definition,
			{ plan: join(projectRoot, ".artifacts", "missing", "PLAN.md") },
			{ projectRoot },
		);
		assert.equal(resolved.status, "ok");
		assert.equal(resolved.values.plan, join(artifactRoot, "missing", "PLAN.md"));
		const reloaded = normalizeWorkflowDataValues(loaded.definition, resolved.values, { projectRoot });
		assert.equal(reloaded.status, "ok");
		assert.deepEqual(reloaded.values, resolved.values);
	});
});

test("canonical file constraints accept safe aliases but reject storage and basename escapes", () => {
	withTempDir((root) => {
		const loaded = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, exampleManifest()));
		assert.equal(loaded.status, "ok");
		const projectRoot = join(root, "project");
		const storage = join(projectRoot, "storage");
		const outside = join(root, "outside");
		mkdirSync(storage, { recursive: true });
		mkdirSync(outside);
		symlinkSync(storage, join(projectRoot, ".artifacts"), "dir");
		symlinkSync(storage, join(projectRoot, "safe-alias"), "dir");
		symlinkSync(outside, join(storage, "escape"), "dir");
		writeFileSync(join(storage, "OTHER.md"), "Wrong artifact.");
		symlinkSync(join(storage, "OTHER.md"), join(storage, "PLAN.md"));
		for (const path of [
			join(projectRoot, "safe-alias", "missing", "PLAN.md"),
			join(storage, "missing", "PLAN.md"),
		]) {
			const accepted = normalizeWorkflowDataValues(loaded.definition, { plan: path }, { projectRoot });
			assert.equal(accepted.status, "ok");
			assert.equal(accepted.values.plan, join(storage, "missing", "PLAN.md"));
		}
		for (const path of [
			join(projectRoot, ".artifacts", "escape", "PLAN.md"),
			join(outside, "PLAN.md"),
			join(projectRoot, "other-storage", "PLAN.md"),
			join(storage, "missing", "OTHER.md"),
			join(storage, "PLAN.md"),
		]) {
			const rejected = normalizeWorkflowDataValues(loaded.definition, { plan: path }, { projectRoot });
			assert.equal(rejected.status, "invalid", path);
		}
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
