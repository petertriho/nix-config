import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { loadWorkflowDefinitionFromPackage } from "../../workflow/schema.ts";
import {
	assertRestrictivePresetPermissions,
	canonicalProjectRoot,
	editWorkflowPresetRoles,
	makeWorkflowModelPreset,
	normalizeWorkflowPresetRoles,
	readWorkflowModelPreset,
	validateWorkflowModelPreset,
	validateWorkflowPresetRoles,
	workflowPresetKey,
	workflowPresetPath,
	writeWorkflowModelPreset,
	type WorkflowPresetRoles,
} from "../../workflow/presets.ts";
import type { NormalizedWorkflowDefinition } from "../../workflow/types.ts";

function withTempDir<T>(run: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-presets-"));
	try {
		return run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

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
	const selections = Object.create(null) as Record<string, WorkflowPresetRoles[string]>;
	for (const roleId of definition.roleIds) {
		selections[roleId] = { provider, model, thinking: "off" };
	}
	return selections;
}

function model(provider: string, id: string, reasoning = true): Model<any> {
	return {
		provider,
		id,
		name: id,
		api: "openai-responses",
		baseUrl: "https://example.test",
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_000,
		thinkingLevelMap: reasoning ? { high: "high" } : undefined,
	};
}

test("validated legacy presets migrate to pi-workflows without deleting legacy files", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const preset = makeWorkflowModelPreset(definition, root, roles(definition));
		const legacy = join(root, "state/pi-tmux-subagents/workflow-presets", `${workflowPresetKey(root, definition.id)}.json`);
		mkdirSync(dirname(legacy), { recursive: true });
		const bytes = JSON.stringify(preset);
		writeFileSync(legacy, bytes);
		const result = readWorkflowModelPreset(definition, root, root);
		assert.equal(result.status, "ok");
		assert.match(result.path, /state\/pi-workflows\/workflow-presets/);
		assert.equal(readFileSync(legacy, "utf8"), bytes);
		assert.deepEqual(JSON.parse(readFileSync(result.path, "utf8")), preset);
	});
});

test("preset conflicts report legacy differences and invalid new files never fall back", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const preset = makeWorkflowModelPreset(definition, root, roles(definition));
		const legacy = join(root, "state/pi-tmux-subagents/workflow-presets", `${workflowPresetKey(root, definition.id)}.json`);
		mkdirSync(dirname(legacy), { recursive: true });
		writeFileSync(legacy, JSON.stringify(preset));
		const newer = makeWorkflowModelPreset(definition, root, roles(definition, "new", "model"));
		const path = writeWorkflowModelPreset(newer, root);
		const current = readWorkflowModelPreset(definition, root, root);
		assert.equal(current.status, "ok");
		if (current.status !== "ok") throw new Error("Expected new preset");
		assert.deepEqual(current.preset, newer);
		assert.match(current.warnings?.join("\n") ?? "", /differs/);
		writeFileSync(path, "{invalid");
		assert.equal(readWorkflowModelPreset(definition, root, root).status, "invalid");
		assert.deepEqual(JSON.parse(readFileSync(legacy, "utf8")), preset);
	});
});

test("legacy migration rejects invalid content and never replaces a colliding new path", () => {
	withTempDir((root) => {
		const definition = loadDefinition(writeWorkflowPackage(root));
		const legacy = join(root, "state/pi-tmux-subagents/workflow-presets", `${workflowPresetKey(root, definition.id)}.json`);
		mkdirSync(dirname(legacy), { recursive: true });
		writeFileSync(legacy, "{}");
		assert.equal(readWorkflowModelPreset(definition, root, root).status, "invalid");
		const preset = makeWorkflowModelPreset(definition, root, roles(definition));
		writeFileSync(legacy, JSON.stringify(preset));
		const path = workflowPresetPath(root, definition.id, root);
		mkdirSync(dirname(path), { recursive: true });
		// A dangling concurrent path is absent to the reader but occupied for exclusive publish.
		symlinkSync(join(root, "not-created"), path);
		const collided = readWorkflowModelPreset(definition, root, root);
		assert.equal(collided.status, "invalid");
		if (collided.status === "invalid") assert.match(collided.error, /EEXIST/);
		assert.deepEqual(JSON.parse(readFileSync(legacy, "utf8")), preset);
	});
});

test("workflow presets are keyed by canonical project root and workflow ID and ignore legacy fixed-role files", () => {
	withTempDir((dir) => {
		const projectA = join(dir, "a");
		const nestedA = join(projectA, "src", "deep");
		const projectB = join(dir, "b");
		const workflowRoot = join(dir, "workflows");
		mkdirSync(nestedA, { recursive: true });
		mkdirSync(projectB);
		mkdirSync(workflowRoot);
		execFileSync("git", ["init"], { cwd: projectA, stdio: "ignore" });
		execFileSync("git", ["init"], { cwd: projectB, stdio: "ignore" });
		const quill = loadDefinition(writeWorkflowPackage(workflowRoot, workflowManifest("quill")));
		const ink = loadDefinition(writeWorkflowPackage(workflowRoot, workflowManifest("ink")));

		assert.equal(canonicalProjectRoot(nestedA), canonicalProjectRoot(projectA));
		assert.equal(workflowPresetKey(nestedA, quill.id), workflowPresetKey(projectA, quill.id));
		assert.notEqual(workflowPresetKey(projectA, quill.id), workflowPresetKey(projectA, ink.id));
		assert.notEqual(workflowPresetKey(projectA, quill.id), workflowPresetKey(projectB, quill.id));

		const legacyKey = createHash("sha256")
			.update(canonicalProjectRoot(projectA))
			.digest("hex");
		const legacyPath = join(
			dir,
			"agent",
			"state",
			"pi-tmux-subagents",
			"workflow-presets",
			`${legacyKey}.json`,
		);
		mkdirSync(dirname(legacyPath), { recursive: true });
		writeFileSync(legacyPath, JSON.stringify({ version: 1, projectRoot: projectA, roles: {} }));
		assert.deepEqual(readWorkflowModelPreset(quill, projectA, join(dir, "agent")), {
			status: "missing",
			path: workflowPresetPath(projectA, quill.id, join(dir, "agent")),
		});
	});
});

test("workflow presets round trip atomically with restrictive permissions and normalized role order", () => {
	withTempDir((dir) => {
		const project = join(dir, "project");
		const workflowRoot = join(dir, "workflows");
		const agentDir = join(dir, "agent");
		mkdirSync(project);
		mkdirSync(workflowRoot);
		const definition = loadDefinition(writeWorkflowPackage(workflowRoot));
		const preset = makeWorkflowModelPreset(
			definition,
			project,
			roles(definition),
			new Date("2026-09-01T12:00:00Z"),
		);
		const path = writeWorkflowModelPreset(preset, agentDir);
		assert.equal(path, workflowPresetPath(project, definition.id, agentDir));
		assert.equal(statSync(path).mode & 0o777, 0o600);
		assert.equal(assertRestrictivePresetPermissions(path), true);
		assert.deepEqual(readdirSync(dirname(path)).filter((name) => name.includes(".tmp-")), []);

		const stored = readWorkflowModelPreset(definition, project, agentDir);
		assert.equal(stored.status, "ok");
		if (stored.status !== "ok") return;
		assert.deepEqual(stored.preset.roles, normalizeWorkflowPresetRoles(definition, roles(definition)));

		const updated = makeWorkflowModelPreset(
			definition,
			project,
			editWorkflowPresetRoles(definition, stored.preset.roles, {
				verifier: { provider: "other", model: "alt", thinking: "high" },
			}),
			new Date("2026-09-01T13:00:00Z"),
		);
		writeWorkflowModelPreset(updated, agentDir);
		const reread = readWorkflowModelPreset(definition, project, agentDir);
		assert.equal(reread.status, "ok");
		if (reread.status === "ok") {
			assert.equal(Object.keys(reread.preset.roles).join(","), definition.roleIds.join(","));
			assert.deepEqual(reread.preset.roles.verifier, {
				provider: "other",
				model: "alt",
				thinking: "high",
			});
		}
	});
});

test("workflow preset validation rejects malformed data, wrong workflow metadata, and exact-role mismatches", () => {
	withTempDir((dir) => {
		const project = join(dir, "project");
		const workflowRoot = join(dir, "workflows");
		const agentDir = join(dir, "agent");
		mkdirSync(project);
		mkdirSync(workflowRoot);
		const definition = loadDefinition(writeWorkflowPackage(workflowRoot));
		const path = workflowPresetPath(project, definition.id, agentDir);
		mkdirSync(dirname(path), { recursive: true });

		writeFileSync(path, JSON.stringify({ version: 99 }));
		assert.equal(readWorkflowModelPreset(definition, project, agentDir).status, "invalid");

		writeFileSync(
			path,
			JSON.stringify({
				version: 1,
				workflowId: "other",
				projectRoot: canonicalProjectRoot(project),
				updatedAt: "2026-09-01T12:00:00.000Z",
				roles: roles(definition),
			}),
		);
		const wrongWorkflow = readWorkflowModelPreset(definition, project, agentDir);
		assert.equal(wrongWorkflow.status, "invalid");
		assert.match(wrongWorkflow.status === "invalid" ? wrongWorkflow.error : "", /belongs to workflow/);

		writeFileSync(
			path,
			JSON.stringify({
				version: 1,
				workflowId: definition.id,
				projectRoot: canonicalProjectRoot(project),
				updatedAt: "2026-09-01T12:00:00.000Z",
				roles: {
					author: { provider: "test", model: "echo", thinking: "off" },
					verifier: { provider: "test", model: "echo", thinking: "off" },
				},
			}),
		);
		const mismatched = readWorkflowModelPreset(definition, project, agentDir);
		assert.equal(mismatched.status, "invalid");
		assert.match(mismatched.status === "invalid" ? mismatched.error : "", /exactly match workflow "quill" roles/);

		const invalid = {
			...makeWorkflowModelPreset(definition, project, roles(definition)),
			token: "secret",
		};
		assert.equal(validateWorkflowModelPreset(invalid), false);
		assert.throws(
			() => writeWorkflowModelPreset(invalid as never, agentDir),
			/Refusing to serialize/,
		);
	});
});

test("editing one workflow role preserves all other assignments", () => {
	withTempDir((dir) => {
		const workflowRoot = join(dir, "workflows");
		mkdirSync(workflowRoot);
		const definition = loadDefinition(writeWorkflowPackage(workflowRoot));
		const baseline = roles(definition);
		const edited = editWorkflowPresetRoles(definition, baseline, {
			verifier: { provider: "openai", model: "gpt-5", thinking: "high" },
		});
		assert.deepEqual(edited.author, baseline.author);
		assert.deepEqual(edited.publisher, baseline.publisher);
		assert.deepEqual(edited.verifier, {
			provider: "openai",
			model: "gpt-5",
			thinking: "high",
		});
	});
});

test("workflow preset assignment validation enforces exact role keys and available models", () => {
	withTempDir((dir) => {
		const workflowRoot = join(dir, "workflows");
		mkdirSync(workflowRoot);
		const definition = loadDefinition(writeWorkflowPackage(workflowRoot));
		const available = [
			model("test", "echo"),
			model("other", "alt"),
			model("local", "plain", false),
		];

		assert.deepEqual(validateWorkflowPresetRoles(definition, roles(definition), available), []);

		const stale = editWorkflowPresetRoles(definition, roles(definition), {
			publisher: { provider: "missing", model: "gone", thinking: "high" },
		});
		const staleErrors = validateWorkflowPresetRoles(definition, stale, available);
		assert.equal(staleErrors.length, 1);
		assert.match(staleErrors[0], /^publisher: Model "missing\/gone:high"/);

		const mismatched = {
			author: { provider: "test", model: "echo", thinking: "off" as const },
			verifier: { provider: "test", model: "echo", thinking: "off" as const },
			reviewer: { provider: "test", model: "echo", thinking: "off" as const },
		};
		const mismatchErrors = validateWorkflowPresetRoles(definition, mismatched, available);
		assert.equal(mismatchErrors.length, 1);
		assert.match(mismatchErrors[0], /missing: publisher/);
		assert.match(mismatchErrors[0], /unexpected: reviewer/);
	});
});

test("optional skips round trip, edit both ways, and bypass only skipped model validation", () => {
	withTempDir((dir) => {
		const manifest = workflowManifest();
		const definition = loadDefinition(writeWorkflowPackage(dir, {
			...manifest,
			roles: manifest.roles.map((role) => role.id === "verifier" ? { ...role, optional: true } : role),
		}));
		const enabled = roles(definition);
		const skipped = editWorkflowPresetRoles(definition, enabled, { verifier: { skip: true } });
		assert.deepEqual(skipped.verifier, { skip: true });
		assert.deepEqual(skipped.author, enabled.author);
		assert.equal(Object.isFrozen(skipped.verifier), true);
		const preset = makeWorkflowModelPreset(definition, dir, skipped);
		assert.equal(preset.version, 1);
		writeWorkflowModelPreset(preset, join(dir, "agent"));
		const restored = readWorkflowModelPreset(definition, dir, join(dir, "agent"));
		assert.equal(restored.status, "ok");
		assert.deepEqual(restored.preset.roles, skipped);
		assert.deepEqual(validateWorkflowPresetRoles(definition, skipped, [model("test", "echo")]), []);
		assert.equal(validateWorkflowPresetRoles(definition, skipped, []).length, 2);

		const unavailable = editWorkflowPresetRoles(definition, skipped, {
			verifier: { provider: "gone", model: "unavailable", thinking: "off" },
		});
		assert.match(validateWorkflowPresetRoles(definition, unavailable, [model("test", "echo")])[0], /^verifier:/);
		assert.deepEqual(
			editWorkflowPresetRoles(definition, skipped, { verifier: enabled.verifier }),
			normalizeWorkflowPresetRoles(definition, enabled),
		);
	});
});

test("skip presets reject required roles, unknown roles, false skips, and mixed model objects", () => {
	withTempDir((dir) => {
		const manifest = workflowManifest();
		const definition = loadDefinition(writeWorkflowPackage(dir, {
			...manifest,
			roles: manifest.roles.map((role) => ({ ...role, optional: role.id === "verifier" })),
		}));
		const enabled = roles(definition);
		assert.throws(
			() => editWorkflowPresetRoles(definition, enabled, { author: { skip: true } }),
			/Required workflow role "author" cannot be skipped/,
		);
		assert.throws(
			() => normalizeWorkflowPresetRoles(definition, { ...enabled, unknown: { skip: true } }),
			/unexpected: unknown/,
		);
		assert.throws(
			() => editWorkflowPresetRoles(definition, enabled, { constructor: { skip: true as const } }),
			/has no role "constructor"/,
		);
		const valid = makeWorkflowModelPreset(definition, dir, enabled);
		for (const assignment of [
			{ skip: false },
			{ skip: "true" },
			{ skip: true, provider: "test", model: "echo", thinking: "off" },
			{ skip: true, thinking: "off" },
			{ skip: true, extra: true },
		]) {
			const invalid = { ...valid, roles: { ...enabled, verifier: assignment } };
			assert.equal(validateWorkflowModelPreset(invalid), false);
			assert.throws(() => normalizeWorkflowPresetRoles(definition, invalid.roles as never), /must contain/);
		}
	});
});
