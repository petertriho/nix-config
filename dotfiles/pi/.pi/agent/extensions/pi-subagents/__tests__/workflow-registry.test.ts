import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import fs, { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	discoverWorkflowRegistry,
} from "../workflow/registry.ts";
import { canonicalProjectRoot, workflowPresetKey } from "../workflow/presets.ts";

test("workflow registry lives inside the subagents workflow coordinator", () => {
	assert.equal(
		dirname(fileURLToPath(new URL("../workflow/registry.ts", import.meta.url))),
		fileURLToPath(new URL("../workflow/", import.meta.url)).replace(/\/$/, ""),
	);
});

test("default bundled registry discovers Peter beneath the subagents workflow coordinator", () => {
	const registry = discoverWorkflowRegistry({ projectTrusted: false });
	const peterPackage = fileURLToPath(new URL("../workflows/peter/", import.meta.url));
	assert.equal(registry.sources[0].root, fileURLToPath(new URL("../workflows/", import.meta.url)).replace(/\/$/, ""));
	assert.equal(registry.workflowById.peter?.packagePath, peterPackage.replace(/\/$/, ""));
	assert.equal(registry.aliases.peter, "peter");
});

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

test("registry discovery and preset keys retain repository, nested, symlink, non-Git, and missing identities", () => {
	withTempDir((root) => {
		const repo = join(root, "repo");
		const nested = join(repo, "nested", "deep");
		const repoAlias = join(root, "repo-alias");
		const plain = join(root, "plain");
		const plainAlias = join(root, "plain-alias");
		const missing = join(root, "missing");
		mkdirSync(nested, { recursive: true });
		mkdirSync(plain);
		initGitRepo(repo);
		symlinkSync(repo, repoAlias, "dir");
		symlinkSync(plain, plainAlias, "dir");
		for (const project of [repo, plain]) {
			writeWorkflowPackage(join(project, ".pi", "workflows"), "quill", workflowManifest("quill"));
		}
		for (const [cwd, expected] of [
			[repo, repo], [nested, repo], [repoAlias, repo], [join(repoAlias, "nested", "deep"), repo],
			[plain, plain], [plainAlias, plain], [missing, missing],
		]) {
			assert.equal(canonicalProjectRoot(cwd), expected);
			assert.equal(workflowPresetKey(cwd, "quill"), createHash("sha256").update(`${expected}\0quill`).digest("hex"));
			for (const trusted of [true, false]) {
				const registry = discoverWorkflowRegistry({
					projectRoot: cwd, projectTrusted: trusted,
					bundledRoot: join(root, "empty-bundled"), globalRoot: join(root, "empty-global"),
				});
				assert.equal(registry.sources[2].root, join(expected, ".pi", "workflows"));
				assert.equal(registry.sources[2].enabled, trusted);
				assert.equal(Object.hasOwn(registry.workflowById, "quill"), trusted && expected !== missing);
				if (trusted && expected !== missing) {
					assert.equal(registry.workflowById.quill.source, "project");
					assert.equal(registry.aliases.quill, "quill");
				}
			}
		}
	});
});

test("registry and presets preserve empty, failed, unavailable, and reported Git-root fallbacks", () => {
	withTempDir((root) => {
		const cwd = join(root, "cwd");
		const bin = join(root, "bin");
		const reported = join(root, "reported");
		const reportedAlias = join(root, "reported-alias");
		const missingReported = join(root, "missing-reported");
		mkdirSync(cwd);
		mkdirSync(bin);
		mkdirSync(reported);
		symlinkSync(reported, reportedAlias, "dir");
		const path = process.env.PATH;
		try {
			for (const [body, expected] of [
				["exit 0", cwd], ["exit 17", cwd],
				[`printf '%s\\n' '${reportedAlias}'`, reported],
				[`printf '%s\\n' '${missingReported}'`, missingReported],
			]) {
				writeFileSync(join(bin, "git"), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
				process.env.PATH = bin;
				assert.equal(canonicalProjectRoot(cwd), expected);
				const registry = discoverWorkflowRegistry({
					projectRoot: cwd, projectTrusted: true,
					bundledRoot: join(root, "empty-bundled"), globalRoot: join(root, "empty-global"),
				});
				assert.equal(registry.sources[2].root, join(expected, ".pi", "workflows"));
				assert.equal(workflowPresetKey(cwd, "quill"), createHash("sha256").update(`${expected}\0quill`).digest("hex"));
			}
			process.env.PATH = join(root, "no-git");
			assert.equal(canonicalProjectRoot(cwd), cwd);
			assert.equal(discoverWorkflowRegistry({
				projectRoot: cwd, bundledRoot: bin, globalRoot: bin,
			}).sources[2].root, join(cwd, ".pi", "workflows"));
		} finally {
			if (path === undefined) delete process.env.PATH;
			else process.env.PATH = path;
		}
	});
});

test("registry and presets do not swallow cwd filesystem canonicalization errors", (t) => {
	withTempDir((root) => {
		const cwd = join(root, "cwd");
		mkdirSync(cwd);
		const original = fs.realpathSync;
		const failure = Object.assign(new Error("canonicalization denied"), { code: "EACCES" });
		const mocked = t.mock.method(fs, "realpathSync", (path: fs.PathLike) => {
			if (path === cwd) throw failure;
			return original(path);
		});
		syncBuiltinESMExports();
		try {
			assert.throws(() => canonicalProjectRoot(cwd), (error) => error === failure);
			assert.throws(() => discoverWorkflowRegistry({
				projectRoot: cwd, bundledRoot: join(root, "empty-bundled"), globalRoot: join(root, "empty-global"),
			}), (error) => error === failure);
		} finally {
			mocked.mock.restore();
			syncBuiltinESMExports();
		}
	});
});
