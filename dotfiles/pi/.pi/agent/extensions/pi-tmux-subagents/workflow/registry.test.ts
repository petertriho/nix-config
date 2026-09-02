import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	discoverWorkflowRegistry,
} from "./registry.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-registry-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function initGitRepo(root: string): void {
	execFileSync("git", ["init", "-q", root], { stdio: "ignore" });
}

function workflowManifest(id: string, commandName = id) {
	return {
		version: 1,
		id,
		command: {
			name: commandName,
			description: `Run the ${id} workflow`,
		},
		skill: "SKILL.md",
		data: {
			note: {
				kind: "file",
				label: "Note",
				constraint: {
					under: ".artifacts",
					basename: `${id.toUpperCase()}.md`,
				},
			},
			tag: {
				kind: "string",
				label: "Tag",
			},
		},
		roles: [
			{
				id: "author",
				label: "Author",
				agent: "writer",
				reads: ["tag", "note"],
				writes: ["file:note"],
				handoff: `Continue ${id}.`,
			},
		],
	};
}

function writeWorkflowPackage(root: string, directoryName: string, manifest: unknown): string {
	const packageDir = join(root, directoryName);
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		[
			"---",
			`name: ${directoryName}`,
			"description: Private workflow orchestration skill.",
			"---",
			"",
			"# Workflow",
			"",
			"Use workflow tools only.",
			"",
		].join("\n"),
	);
	return packageDir;
}

function writeBrokenWorkflowPackage(root: string, directoryName: string): string {
	const packageDir = join(root, directoryName);
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), "{\n");
	writeFileSync(
		join(packageDir, "SKILL.md"),
		"---\nname: broken\ndescription: Broken workflow\n---\n\n# Workflow\n\nBroken.\n",
	);
	return packageDir;
}

test("discoverWorkflowRegistry finds bundled, global, and trusted project workflows with precedence", () => {
	withTempDir((root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		const repoRoot = join(root, "repo");
		const projectWorkflowsRoot = join(repoRoot, ".pi", "workflows");
		const nestedProjectDir = join(repoRoot, "apps", "demo");

		mkdirSync(bundledRoot, { recursive: true });
		mkdirSync(globalRoot, { recursive: true });
		mkdirSync(projectWorkflowsRoot, { recursive: true });
		mkdirSync(nestedProjectDir, { recursive: true });
		initGitRepo(repoRoot);

		writeWorkflowPackage(bundledRoot, "bundled-only", workflowManifest("bundled-only"));
		writeWorkflowPackage(bundledRoot, "shared-bundled", workflowManifest("shared"));
		writeWorkflowPackage(globalRoot, "global-only", workflowManifest("global-only"));
		writeWorkflowPackage(globalRoot, "shared-global", workflowManifest("shared"));
		writeWorkflowPackage(projectWorkflowsRoot, "project-only", workflowManifest("project-only"));
		const projectPackage = writeWorkflowPackage(projectWorkflowsRoot, "shared-project", workflowManifest("shared"));

		mkdirSync(join(bundledRoot, "nested", "deeper"), { recursive: true });
		writeWorkflowPackage(join(bundledRoot, "nested"), "deeper", workflowManifest("ignored-nested"));

		const registry = discoverWorkflowRegistry({
			bundledRoot,
			globalRoot,
			projectRoot: nestedProjectDir,
			projectTrusted: true,
		});

		assert.deepEqual(
			registry.workflows.map((workflow) => workflow.id),
			["bundled-only", "global-only", "project-only", "shared"],
		);
		assert.equal(registry.workflowById.shared.source, "project");
		assert.equal(registry.workflowById.shared.packagePath, projectPackage);
		assert.equal(registry.workflowById["bundled-only"].source, "bundled");
		assert.equal(registry.workflowById["global-only"].source, "global");
		assert.equal(registry.workflowById["project-only"].source, "project");
		assert.equal(registry.workflowById.shared.manifestPath, join(projectPackage, "workflow.json"));
		assert.equal(registry.workflowById.shared.skillPath, join(projectPackage, "SKILL.md"));
		assert.equal(registry.sources[2].source, "project");
		assert.equal(registry.sources[2].enabled, true);
		assert.equal(registry.sources[2].root, projectWorkflowsRoot);
		assert.equal(registry.workflowById["ignored-nested"], undefined);
	});
});

test("discoverWorkflowRegistry excludes untrusted project workflows and still applies global override", () => {
	withTempDir((root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		const repoRoot = join(root, "repo");
		const projectWorkflowsRoot = join(repoRoot, ".pi", "workflows");
		const nestedProjectDir = join(repoRoot, "subdir");

		mkdirSync(bundledRoot, { recursive: true });
		mkdirSync(globalRoot, { recursive: true });
		mkdirSync(projectWorkflowsRoot, { recursive: true });
		mkdirSync(nestedProjectDir, { recursive: true });
		initGitRepo(repoRoot);

		writeWorkflowPackage(bundledRoot, "shared-bundled", workflowManifest("shared"));
		const globalPackage = writeWorkflowPackage(globalRoot, "shared-global", workflowManifest("shared"));
		writeWorkflowPackage(projectWorkflowsRoot, "project-only", workflowManifest("project-only"));

		const registry = discoverWorkflowRegistry({
			bundledRoot,
			globalRoot,
			projectRoot: nestedProjectDir,
			projectTrusted: false,
		});

		assert.equal(registry.sources[2].enabled, false);
		assert.equal(registry.workflowById.shared.source, "global");
		assert.equal(registry.workflowById.shared.packagePath, globalPackage);
		assert.equal(registry.workflowById["project-only"], undefined);
	});
});

test("discoverWorkflowRegistry rejects same-scope duplicate IDs with deterministic path diagnostics", () => {
	withTempDir((root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(bundledRoot, { recursive: true });
		mkdirSync(globalRoot, { recursive: true });

		const laterPackage = writeWorkflowPackage(
			bundledRoot,
			"z-ambiguous",
			workflowManifest("ambiguous"),
		);
		const earlierPackage = writeWorkflowPackage(
			bundledRoot,
			"a-ambiguous",
			workflowManifest("ambiguous"),
		);
		writeWorkflowPackage(bundledRoot, "shared-bundled", workflowManifest("shared"));
		const globalShared = writeWorkflowPackage(
			globalRoot,
			"shared-global",
			workflowManifest("shared"),
		);

		const registry = discoverWorkflowRegistry({
			bundledRoot,
			globalRoot,
			projectTrusted: false,
		});

		assert.equal(registry.workflowById.ambiguous, undefined);
		assert.equal(registry.workflowById.shared.source, "global");
		assert.equal(registry.workflowById.shared.packagePath, globalShared);

		const packagePaths = [earlierPackage, laterPackage];
		const duplicateDiagnostics = registry.diagnostics.filter((diagnostic) =>
			diagnostic.kind === "package"
			&& diagnostic.source === "bundled"
			&& diagnostic.workflowId === "ambiguous"
		);
		assert.deepEqual(
			duplicateDiagnostics.map((diagnostic) => ({
				packagePath: diagnostic.packagePath,
				path: diagnostic.path,
			})),
			packagePaths.map((packagePath) => ({
				packagePath,
				path: join(packagePath, "workflow.json"),
			})),
		);
		for (const diagnostic of duplicateDiagnostics) {
			assert.equal(
				diagnostic.message,
				`Duplicate workflow ID "ambiguous" in bundled scope: ${packagePaths.join(", ")}. No workflow from this scope was registered for this ID.`,
			);
		}
	});
});

test("discoverWorkflowRegistry keeps valid workflows when another package is invalid and reports exact paths", () => {
	withTempDir((root) => {
		const bundledRoot = join(root, "bundled");
		const globalRoot = join(root, "global");
		mkdirSync(bundledRoot, { recursive: true });
		mkdirSync(globalRoot, { recursive: true });

		writeWorkflowPackage(bundledRoot, "valid", workflowManifest("valid"));
		const brokenPackage = writeBrokenWorkflowPackage(globalRoot, "broken");

		const registry = discoverWorkflowRegistry({
			bundledRoot,
			globalRoot,
			projectTrusted: false,
		});

		assert.equal(registry.workflowById.valid.id, "valid");
		assert.ok(
			registry.diagnostics.some((diagnostic) =>
				diagnostic.kind === "package"
				&& diagnostic.source === "global"
				&& diagnostic.packagePath === brokenPackage
				&& diagnostic.path === join(brokenPackage, "workflow.json")
				&& /Malformed workflow manifest JSON/.test(diagnostic.message)
			),
			JSON.stringify(registry.diagnostics, null, 2),
		);
	});
});

test("discoverWorkflowRegistry disables duplicate workflow aliases without removing either workflow", () => {
	withTempDir((root) => {
		const bundledRoot = join(root, "bundled");
		mkdirSync(bundledRoot, { recursive: true });

		writeWorkflowPackage(bundledRoot, "alpha", workflowManifest("alpha", "ship"));
		writeWorkflowPackage(bundledRoot, "beta", workflowManifest("beta", "ship"));

		const registry = discoverWorkflowRegistry({
			bundledRoot,
			projectTrusted: false,
		});

		assert.equal(registry.workflowById.alpha.alias.status, "workflow-collision");
		assert.equal(registry.workflowById.beta.alias.status, "workflow-collision");
		assert.deepEqual(registry.workflowById.alpha.alias.collidingWorkflowIds, ["alpha", "beta"]);
		assert.equal(registry.aliases.ship, undefined);
		assert.ok(registry.workflowById.alpha);
		assert.ok(registry.workflowById.beta);
		assert.ok(
			registry.diagnostics.some((diagnostic) =>
				diagnostic.kind === "alias"
				&& diagnostic.alias === "ship"
				&& diagnostic.path === registry.workflowById.alpha.manifestPath
				&& /named alias disabled/.test(diagnostic.message)
			),
			JSON.stringify(registry.diagnostics, null, 2),
		);
	});
});

test("discoverWorkflowRegistry disables only the named alias when it collides with existing commands", () => {
	withTempDir((root) => {
		const bundledRoot = join(root, "bundled");
		mkdirSync(bundledRoot, { recursive: true });

		writeWorkflowPackage(bundledRoot, "colliding", workflowManifest("colliding", "ship"));
		writeWorkflowPackage(bundledRoot, "available", workflowManifest("available", "draft"));

		const registry = discoverWorkflowRegistry({
			bundledRoot,
			projectTrusted: false,
			existingCommands: [
				{ name: "ship", source: "prompt" },
				{ name: "ship", source: "skill" },
				{ name: "agent-models", source: "extension" },
			],
		});

		assert.equal(registry.workflowById.colliding.alias.status, "command-collision");
		assert.deepEqual(
			registry.workflowById.colliding.alias.collidingCommands.map((command) => command.source),
			["prompt", "skill"],
		);
		assert.equal(registry.aliases.ship, undefined);
		assert.equal(registry.workflowById.available.alias.status, "available");
		assert.equal(registry.aliases.draft, "available");
	});
});
