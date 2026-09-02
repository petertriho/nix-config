import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import {
	captureWorkflowWriteBoundarySnapshot,
	describeWorkflowWriteBoundaryReport,
	evaluateWorkflowWriteBoundarySnapshot,
	formatWorkflowWriteBoundaryViolation,
	resolveWorkflowWritePolicy,
} from "./write-policy.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-write-policy-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function withTempRepo(run: (root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-write-repo-"));
	try {
		execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
		execFileSync("git", ["config", "core.excludesFile", "/dev/null"], { cwd: root });
		execFileSync("git", ["config", "user.email", "t@t"], { cwd: root });
		execFileSync("git", ["config", "user.name", "t"], { cwd: root });
		writeFileSync(join(root, "tracked.txt"), "initial\n");
		execFileSync("git", ["add", "tracked.txt"], { cwd: root });
		execFileSync("git", ["commit", "-m", "initial"], { cwd: root, stdio: "ignore" });
		run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function writeWorkflowPackage(root: string, manifest: unknown): string {
	const packageDir = join(root, "demo");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(join(packageDir, "workflow.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		[
			"---",
			"name: demo-workflow",
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

function loadDefinition(manifest: unknown) {
	let definition:
		| ReturnType<typeof loadWorkflowDefinitionFromPackage>
		| undefined;
	withTempDir((root) => {
		definition = loadWorkflowDefinitionFromPackage(writeWorkflowPackage(root, manifest));
	});
	if (!definition || definition.status !== "ok") {
		throw new Error(`Expected a valid workflow definition, got ${JSON.stringify(definition)}`);
	}
	return definition.definition;
}

function quillManifest(options: {
	withConstraint?: boolean;
	withVerifierConstraint?: boolean;
} = {}) {
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
				label: "Draft",
				...(options.withConstraint
					? {
						constraint: {
							under: ".notes",
							basename: "DRAFT.md",
						},
					}
					: {}),
			},
			verificationLog: {
				kind: "file",
				label: "Verification log",
				...(options.withVerifierConstraint
					? {
						constraint: {
							under: ".notes",
							basename: "VERIFY.md",
						},
					}
					: {}),
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
				reads: ["draftDoc", "releaseTag"],
				writes: ["file:draftDoc"],
				handoff: "Continue authoring from the saved draft.",
			},
			{
				id: "verifier",
				label: "Verifier",
				agent: "checker",
				reads: ["draftDoc", "verificationLog"],
				writes: [],
				handoff: "Verify the saved draft only.",
			},
		],
	};
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

test("resolveWorkflowWritePolicy prefers exact file values for file-only roles", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		const draftPath = join(root, ".notes", "DRAFT.md");
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: draftPath,
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		assert.deepEqual(result.policy.resolvedWrites, [
			{
				capability: "file:draftDoc",
				kind: "file",
				slotId: "draftDoc",
				label: "Draft",
				exactPath: draftPath,
			},
		]);
		assert.deepEqual(result.policy.protectedFiles, [
			{
				kind: "file",
				slotId: "draftDoc",
				label: "Draft",
				exactPath: draftPath,
			},
		]);

		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);
		mkdirSync(join(root, ".notes"), { recursive: true });
		writeFileSync(draftPath, "draft\n");
		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual(report.allowedPaths, [".notes/DRAFT.md"]);
		assert.deepEqual(report.unexpectedPaths, []);
	});
});

test("resolveWorkflowWritePolicy falls back to a safe constraint when an exact file path is unknown", () => {
	const definition = loadDefinition(quillManifest({
		withConstraint: true,
		withVerifierConstraint: true,
	}));
	withTempRepo((root) => {
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{ releaseTag: "v1.2.3" },
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		assert.deepEqual(result.policy.resolvedWrites, [
			{
				capability: "file:draftDoc",
				kind: "file",
				slotId: "draftDoc",
				label: "Draft",
				constraint: { under: ".notes", basename: "DRAFT.md" },
			},
		]);
		assert.deepEqual(result.policy.protectedFiles, [
			{
				kind: "file",
				slotId: "draftDoc",
				label: "Draft",
				constraint: { under: ".notes", basename: "DRAFT.md" },
			},
			{
				kind: "file",
				slotId: "verificationLog",
				label: "Verification log",
				constraint: { under: ".notes", basename: "VERIFY.md" },
			},
		]);

		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);
		mkdirSync(join(root, ".notes", "release"), { recursive: true });
		writeFileSync(join(root, ".notes", "release", "DRAFT.md"), "draft\n");
		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual(report.allowedPaths, [".notes/release/DRAFT.md"]);
		assert.deepEqual(report.unexpectedPaths, []);
	});
});

test("resolveWorkflowWritePolicy rejects missing writable paths and worktree protection gaps", () => {
	const exactOnlyDefinition = loadDefinition(quillManifest());
	let result = resolveWorkflowWritePolicy(exactOnlyDefinition, "author", {});
	assert.equal(result.status, "invalid");
	assert.ok(
		result.diagnostics.some((diagnostic) =>
			/slot "draftDoc"/.test(diagnostic.message)
			&& /exact value or a safe repository-relative constraint/.test(diagnostic.message)
		),
		JSON.stringify(result.diagnostics, null, 2),
	);

	const worktreeDefinition = loadDefinition(quillManifest({
		withConstraint: true,
		withVerifierConstraint: false,
	}));
	result = resolveWorkflowWritePolicy(
		worktreeDefinition,
		"author",
		{
			draftDoc: "/tmp/not-inside-repo.md",
			releaseTag: "v1.2.3",
		},
		{ projectRoot: "/tmp/project-root" },
	);
	assert.equal(result.status, "invalid");

	const forgeDefinition = loadDefinition({
		version: 1,
		id: "forge",
		command: {
			name: "forge",
			description: "Run the builder workflow",
		},
		skill: "SKILL.md",
		data: {
			scratchPad: {
				kind: "file",
				label: "Scratch pad",
			},
			baseRef: {
				kind: "string",
				label: "Base ref",
			},
		},
		roles: [
			{
				id: "builder",
				label: "Builder",
				agent: "executor",
				reads: ["baseRef"],
				writes: ["worktree"],
				handoff: "Keep building from the active branch.",
			},
		],
	});
	result = resolveWorkflowWritePolicy(
		forgeDefinition,
		"builder",
		{ baseRef: "main" },
	);
	assert.equal(result.status, "invalid");
	assert.ok(
		result.diagnostics.some((diagnostic) =>
			/scratchPad/.test(diagnostic.message) && /cannot use worktree/.test(diagnostic.message)
		),
		JSON.stringify(result.diagnostics, null, 2),
	);
});

test("executor-like roles can change code and their declared task file but not other protected workflow files", () => {
	const definition = loadDefinition(pterLikeManifest());
	withTempRepo((root) => {
		const values = {
			plan: join(root, ".artifacts", "demo", "PLAN.md"),
			tasks: join(root, ".artifacts", "demo", "TASKS.md"),
			review: join(root, ".artifacts", "demo", "REVIEW.md"),
			baseRef: "main",
		};
		const result = resolveWorkflowWritePolicy(definition, "executor", values, { projectRoot: root });
		assert.equal(result.status, "ok");
		assert.equal(result.policy.workflowId, "pter");
		assert.equal(result.policy.roleId, "executor");
		assert.equal(result.policy.roleLabel, "Executor");
		assert.deepEqual(
			result.policy.resolvedWrites.map((rule) => rule.capability),
			["worktree", "file:tasks"],
		);
		assert.equal(result.policy.protectedFiles.length, 3);

		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);

		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
		writeFileSync(values.tasks, "- [ ] implement\n");
		let report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual(report.allowedPaths, [".artifacts/demo/TASKS.md", "src/index.ts"]);
		assert.deepEqual(report.unexpectedPaths, []);

		writeFileSync(values.review, "review\n");
		report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.equal(report.workflowId, "pter");
		assert.equal(report.roleId, "executor");
		assert.equal(report.roleLabel, "Executor");
		assert.ok(report.unexpectedPaths.includes(".artifacts/demo/REVIEW.md"));
	});
});

test("workflow boundaries detect ignored declared files under active ignore rules", () => {
	const definition = loadDefinition(pterLikeManifest());
	withTempRepo((root) => {
		writeFileSync(join(root, ".gitignore"), ".artifacts/\n");
		execFileSync("git", ["add", ".gitignore"], { cwd: root });
		execFileSync("git", ["commit", "-m", "ignore workflow artifacts"], {
			cwd: root,
			stdio: "ignore",
		});
		const values = {
			plan: join(root, ".artifacts", "demo", "PLAN.md"),
			tasks: join(root, ".artifacts", "demo", "TASKS.md"),
			review: join(root, ".artifacts", "demo", "REVIEW.md"),
			baseRef: "main",
		};
		const result = resolveWorkflowWritePolicy(definition, "executor", values, {
			projectRoot: root,
		});
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);

		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		writeFileSync(values.review, "ignored but protected\n");
		assert.equal(
			execFileSync("git", ["check-ignore", ".artifacts/demo/REVIEW.md"], {
				cwd: root,
				encoding: "utf8",
			}).trim(),
			".artifacts/demo/REVIEW.md",
		);
		assert.doesNotMatch(
			execFileSync(
				"git",
				["status", "--porcelain=v1", "--untracked-files=all"],
				{ cwd: root, encoding: "utf8" },
			),
			/REVIEW\.md/,
		);

		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, [".artifacts/demo/REVIEW.md"]);
	});
});

test("workflow boundaries preserve dirty starts and report only net role changes", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		appendFileSync(join(root, "tracked.txt"), "pre-existing dirt\n");
		writeFileSync(join(root, "old-dirt.ts"), "already here\n");
		const draftPath = join(root, ".notes", "DRAFT.md");
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: draftPath,
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);
		assert.ok(snapshot.before.changedPaths.includes("tracked.txt"));
		assert.ok(snapshot.before.changedPaths.includes("old-dirt.ts"));

		mkdirSync(join(root, ".notes"), { recursive: true });
		writeFileSync(draftPath, "draft\n");
		let report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual(report.allowedPaths, [".notes/DRAFT.md"]);
		assert.deepEqual(report.unexpectedPaths, []);

		appendFileSync(join(root, "tracked.txt"), "role edit\n");
		report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.allowedPaths, [".notes/DRAFT.md"]);
		assert.deepEqual(report.unexpectedPaths, ["tracked.txt"]);
	});
});

test("workflow boundary rename detection retains both source and destination paths", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		const draftPath = join(root, ".notes", "DRAFT.md");
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: draftPath,
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);

		mkdirSync(join(root, ".notes"), { recursive: true });
		renameSync(join(root, "tracked.txt"), draftPath);
		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.allowedPaths, [".notes/DRAFT.md"]);
		assert.deepEqual(report.unexpectedPaths, ["tracked.txt"]);
		assert.ok(existsSync(draftPath));
		assert.equal(existsSync(join(root, "tracked.txt")), false);
	});
});

test("workflow boundary reports tracked-file deletion without restoring it", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: join(root, ".notes", "DRAFT.md"),
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);

		rmSync(join(root, "tracked.txt"));
		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["tracked.txt"]);
		assert.equal(existsSync(join(root, "tracked.txt")), false);
	});
});

test("workflow boundary treats index-only staging as a violation for an allowed file", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		const draftPath = join(root, ".notes", "DRAFT.md");
		mkdirSync(join(root, ".notes"), { recursive: true });
		writeFileSync(draftPath, "pre-existing dirty draft\n");
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: draftPath,
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);

		execFileSync("git", ["add", ".notes/DRAFT.md"], { cwd: root });
		const statusBefore = execFileSync(
			"git",
			["status", "--porcelain=v1", "--untracked-files=all"],
			{ cwd: root, encoding: "utf8" },
		);
		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, [".notes/DRAFT.md"]);
		assert.equal(
			execFileSync(
				"git",
				["status", "--porcelain=v1", "--untracked-files=all"],
				{ cwd: root, encoding: "utf8" },
			),
			statusBefore,
			"evaluation must leave the role's staged state intact",
		);
	});
});

test("workflow boundary treats HEAD changes as violations without resetting the commit", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: join(root, ".notes", "DRAFT.md"),
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);

		appendFileSync(join(root, "tracked.txt"), "committed by role\n");
		execFileSync("git", ["add", "tracked.txt"], { cwd: root });
		execFileSync("git", ["commit", "-m", "unexpected"], {
			cwd: root,
			stdio: "ignore",
		});
		const headAfterCommit = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: root,
			encoding: "utf8",
		}).trim();

		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["<repository HEAD>", "tracked.txt"]);
		assert.equal(
			execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
			headAfterCommit,
			"evaluation must not reset the role's commit",
		);
	});
});

test("workflow boundary capture failures fail closed before and after a role run", () => {
	const definition = loadDefinition(quillManifest());
	withTempRepo((root) => {
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: join(root, ".notes", "DRAFT.md"),
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		writeFileSync(join(root, ".git", "index"), "not a git index\n");
		assert.throws(
			() => captureWorkflowWriteBoundarySnapshot(result.policy, root),
			/Could not capture the repository boundary baseline/,
		);
	});

	withTempRepo((root) => {
		const result = resolveWorkflowWritePolicy(
			definition,
			"author",
			{
				draftDoc: join(root, ".notes", "DRAFT.md"),
				releaseTag: "v1.2.3",
			},
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, root);
		assert.ok(snapshot);
		writeFileSync(join(root, ".git", "index"), "not a git index\n");

		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.equal(report.violated, true);
		assert.match(report.manualReviewReason ?? "", /manual review is required/i);
		const outcome = describeWorkflowWriteBoundaryReport(report);
		assert.match(outcome.violationText ?? "", /VIOLATION — MANUAL REVIEW REQUIRED/);
		assert.match(outcome.violationText ?? "", /post-run capture failed/i);
		assert.equal(
			(outcome.details.workflowWriteBoundary as Record<string, unknown>).manualReviewReason,
			report.manualReviewReason,
		);
	});
});

test("no-write roles report manifest-driven details and preserve the worktree on violation", () => {
	const definition = loadDefinition(quillManifest({
		withConstraint: true,
		withVerifierConstraint: true,
	}));
	withTempRepo((root) => {
		mkdirSync(join(root, "nested"), { recursive: true });
		const result = resolveWorkflowWritePolicy(
			definition,
			"verifier",
			{ releaseTag: "v1.2.3" },
			{ projectRoot: root },
		);
		assert.equal(result.status, "ok");
		assert.deepEqual(result.policy.resolvedWrites, []);
		const snapshot = captureWorkflowWriteBoundarySnapshot(result.policy, join(root, "nested"));
		assert.ok(snapshot);
		assert.equal(snapshot.repoRoot, root);

		appendFileSync(join(root, "tracked.txt"), "review edit\n");
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "index.ts"), "code\n");
		const statusBefore = execFileSync(
			"git",
			["status", "--porcelain=v1", "--untracked-files=all"],
			{ cwd: root, encoding: "utf8" },
		);

		const report = evaluateWorkflowWriteBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.equal(report.workflowId, "quill");
		assert.equal(report.roleId, "verifier");
		assert.equal(report.roleLabel, "Verifier");
		assert.deepEqual(report.protectedFiles, [
			{
				kind: "file",
				slotId: "draftDoc",
				label: "Draft",
				constraint: { under: ".notes", basename: "DRAFT.md" },
			},
			{
				kind: "file",
				slotId: "verificationLog",
				label: "Verification log",
				constraint: { under: ".notes", basename: "VERIFY.md" },
			},
		]);
		assert.deepEqual(report.unexpectedPaths, ["src/index.ts", "tracked.txt"]);
		assert.equal(
			execFileSync(
				"git",
				["status", "--porcelain=v1", "--untracked-files=all"],
				{ cwd: root, encoding: "utf8" },
			),
			statusBefore,
			"evaluation must leave the worktree untouched",
		);

		const text = formatWorkflowWriteBoundaryViolation(report);
		assert.match(text, /WORKFLOW WRITE POLICY VIOLATION/);
		assert.match(text, /workflow "quill" role Verifier \(verifier\)/);
		assert.match(text, /- src\/index\.ts/);
		assert.match(text, /- tracked\.txt/);
		assert.match(text, /Do not revert, restore, delete, stage, or commit anything/);

		const outcome = describeWorkflowWriteBoundaryReport(report);
		const details = outcome.details.workflowWriteBoundary as {
			workflowId: string;
			roleId: string;
			roleLabel: string;
			resolvedRules: unknown;
			unexpectedPaths: readonly string[];
			violated: boolean;
		};
		assert.equal(details.workflowId, "quill");
		assert.equal(details.roleId, "verifier");
		assert.equal(details.roleLabel, "Verifier");
		assert.deepEqual(details.resolvedRules, report.resolvedRules);
		assert.deepEqual(details.unexpectedPaths, ["src/index.ts", "tracked.txt"]);
		assert.equal(details.violated, true);
		assert.equal(outcome.violationText, text);
	});
});
