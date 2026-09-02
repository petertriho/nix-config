import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	captureRepoBoundarySnapshot,
	captureRepoState,
	compareRepoBoundaryRules,
	evaluateRepoBoundarySnapshot,
	resolveGitRoot,
} from "./repo-postconditions.ts";

function withTempRepo(run: (root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-repo-boundaries-"));
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

function addSubmodule(root: string): string {
	const source = mkdtempSync(join(tmpdir(), "pi-repo-boundaries-submodule-"));
	try {
		execFileSync("git", ["init"], { cwd: source, stdio: "ignore" });
		execFileSync("git", ["config", "core.excludesFile", "/dev/null"], { cwd: source });
		execFileSync("git", ["config", "user.email", "t@t"], { cwd: source });
		execFileSync("git", ["config", "user.name", "t"], { cwd: source });
		writeFileSync(join(source, "submodule.txt"), "initial\n");
		execFileSync("git", ["add", "submodule.txt"], { cwd: source });
		execFileSync("git", ["commit", "-m", "initial"], { cwd: source, stdio: "ignore" });
		execFileSync(
			"git",
			["-c", "protocol.file.allow=always", "submodule", "add", source, "vendor/sub"],
			{ cwd: root, stdio: "ignore" },
		);
		execFileSync("git", ["commit", "-am", "add submodule"], {
			cwd: root,
			stdio: "ignore",
		});
		return join(root, "vendor", "sub");
	} finally {
		rmSync(source, { recursive: true, force: true });
	}
}

test("generic boundaries allow explicit files and worktree edits outside protected files", () => {
	withTempRepo((root) => {
		const before = captureRepoState(root);
		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, ".artifacts", "demo", "plan.txt"), "plan\n");
		writeFileSync(join(root, ".artifacts", "demo", "tasks.txt"), "tasks\n");
		writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");

		const report = compareRepoBoundaryRules(
			before,
			captureRepoState(root),
			{
				allowedRules: [
					{ capability: "worktree", kind: "worktree" },
					{ kind: "file", exactPath: ".artifacts/demo/tasks.txt" },
				],
				protectedRules: [
					{ kind: "file", exactPath: ".artifacts/demo/plan.txt" },
					{ kind: "file", exactPath: ".artifacts/demo/tasks.txt" },
				],
			},
			root,
		);
		assert.equal(report.violated, true);
		assert.deepEqual(report.allowedPaths, [".artifacts/demo/tasks.txt", "src/index.ts"]);
		assert.deepEqual(report.unexpectedPaths, [".artifacts/demo/plan.txt"]);
	});
});

test("root-level dotdot-prefixed file names match exact-file rules while parent escapes stay violations", () => {
	withTempRepo((root) => {
		writeFileSync(join(root, ".gitignore"), "..draft.md\n");
		execFileSync("git", ["add", ".gitignore"], { cwd: root });
		execFileSync("git", ["commit", "-m", "ignore root drafts"], { cwd: root, stdio: "ignore" });

		const snapshot = captureRepoBoundarySnapshot(root, {
			allowedRules: [{ kind: "file", exactPath: "..draft.md" }],
			protectedRules: [],
		});
		assert.ok(snapshot);
		writeFileSync(join(root, "..draft.md"), "draft\n");
		const report = evaluateRepoBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual(report.allowedPaths, ["..draft.md"]);

		const escape = compareRepoBoundaryRules(
			{ changedPaths: [], signatures: new Map() },
			{ changedPaths: ["../outside.txt"], signatures: new Map([["../outside.txt", "edited"]]) },
			{
				allowedRules: [{ kind: "file", exactPath: "..draft.md" }],
				protectedRules: [],
			},
			root,
		);
		assert.equal(escape.violated, true);
		assert.deepEqual(escape.unexpectedPaths, ["../outside.txt"]);
	});
});

test("snapshots compare against the dirty start and report only net role changes", () => {
	withTempRepo((root) => {
		appendFileSync(join(root, "tracked.txt"), "pre-existing dirt\n");
		const snapshot = captureRepoBoundarySnapshot(root, {
			allowedRules: [{ kind: "file", exactPath: "output.txt" }],
			protectedRules: [],
		});
		assert.ok(snapshot);
		assert.equal(snapshot.repoRoot, resolveGitRoot(root));

		writeFileSync(join(root, "output.txt"), "allowed\n");
		let report = evaluateRepoBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, false);
		assert.deepEqual(report.allowedPaths, ["output.txt"]);

		appendFileSync(join(root, "tracked.txt"), "role edit\n");
		report = evaluateRepoBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["tracked.txt"]);
	});
});

test("staging and HEAD changes are violations and evaluation preserves them", () => {
	withTempRepo((root) => {
		const snapshot = captureRepoBoundarySnapshot(root, {
			allowedRules: [{ capability: "worktree", kind: "worktree" }],
			protectedRules: [],
		});
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

		const report = evaluateRepoBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["<repository HEAD>", "tracked.txt"]);
		assert.equal(
			execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
			headAfterCommit,
		);
		assert.equal(readFileSync(join(root, "tracked.txt"), "utf8"), "initial\ncommitted by role\n");
	});
});

test("boundary evaluation reports deletes without restoring repository files", () => {
	withTempRepo((root) => {
		const snapshot = captureRepoBoundarySnapshot(root, {
			allowedRules: [],
			protectedRules: [],
		});
		assert.ok(snapshot);
		rmSync(join(root, "tracked.txt"));
		const report = evaluateRepoBoundarySnapshot(snapshot);
		assert.ok(report);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["tracked.txt"]);
		assert.equal(existsSync(join(root, "tracked.txt")), false);
	});
});

test("baseline repository capture failures reject instead of disabling the boundary", () => {
	withTempRepo((root) => {
		writeFileSync(join(root, ".git", "index"), "not a git index\n");
		assert.throws(
			() => captureRepoBoundarySnapshot(root, {
				allowedRules: [],
				protectedRules: [],
			}),
			/Could not capture the repository boundary baseline/,
		);
	});
});

test("post-run repository capture failures require explicit manual review", () => {
	withTempRepo((root) => {
		const snapshot = captureRepoBoundarySnapshot(root, {
			allowedRules: [],
			protectedRules: [],
		});
		assert.ok(snapshot);
		writeFileSync(join(root, ".git", "index"), "not a git index\n");

		const report = evaluateRepoBoundarySnapshot(snapshot);
		assert.equal(report.violated, true);
		assert.deepEqual(report.allowedPaths, []);
		assert.deepEqual(report.unexpectedPaths, []);
		assert.match(report.manualReviewReason ?? "", /manual review is required/i);
	});
});

test("already-dirty submodules report additional changes relative to their dirty baseline", () => {
	withTempRepo((root) => {
		const submoduleRoot = addSubmodule(root);
		appendFileSync(join(submoduleRoot, "submodule.txt"), "pre-existing dirt\n");
		const snapshot = captureRepoBoundarySnapshot(root, {
			allowedRules: [],
			protectedRules: [],
		});
		assert.ok(snapshot);

		let report = evaluateRepoBoundarySnapshot(snapshot);
		assert.equal(report.violated, false);
		assert.deepEqual(report.unexpectedPaths, []);

		appendFileSync(join(submoduleRoot, "submodule.txt"), "role edit\n");
		report = evaluateRepoBoundarySnapshot(snapshot);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["vendor/sub"]);
	});
});
