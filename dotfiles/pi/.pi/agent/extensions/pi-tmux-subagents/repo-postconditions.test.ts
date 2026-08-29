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
	capturePhaseBoundarySnapshot,
	captureRepoState,
	comparePhaseArtifact,
	comparePhasePaths,
	evaluatePhaseBoundarySnapshot,
	formatPhaseBoundaryViolation,
	phaseArtifactForPhase,
	resolveGitRoot,
} from "./repo-postconditions.ts";

function withTempRepo(run: (root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-phase-postconditions-"));
	try {
		execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
		writeFileSync(join(root, "tracked.txt"), "initial\n");
		execFileSync("git", ["add", "tracked.txt"], { cwd: root });
		execFileSync("git", ["commit", "-m", "initial"], { cwd: root, stdio: "ignore" });
		run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("clean repository accepts only the expected artifact path", () => {
	withTempRepo((root) => {
		const before = captureRepoState(root);
		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		writeFileSync(join(root, ".artifacts", "demo", "PLAN.md"), "plan\n");
		const after = captureRepoState(root);
		const report = comparePhasePaths(before, after, [".artifacts/demo/PLAN.md"], root);
		assert.equal(report.violated, false);
	});
});

test("unexpected tracked and untracked paths stop without change to the tree", () => {
	withTempRepo((root) => {
		const before = captureRepoState(root);
		appendFileSync(join(root, "tracked.txt"), "changed\n");
		writeFileSync(join(root, "new.ts"), "code\n");
		const after = captureRepoState(root);
		const report = comparePhasePaths(before, after, [".artifacts/demo/PLAN.md"], root);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["new.ts", "tracked.txt"]);
		assert.equal(join(root, "new.ts"), join(root, "new.ts"));
	});
});

test("initial dirty expected artifact and unrelated unchanged dirty path pass", () => {
	withTempRepo((root) => {
		appendFileSync(join(root, "tracked.txt"), "pre-existing dirt\n");
		const before = captureRepoState(root);
		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		writeFileSync(join(root, ".artifacts", "demo", "TASKS.md"), "tasks\n");
		const after = captureRepoState(root);
		const report = comparePhasePaths(before, after, [".artifacts/demo/TASKS.md"], root);
		assert.equal(report.violated, false);
	});
});

test("initial dirty unexpected path is flagged only when the phase changes it", () => {
	withTempRepo((root) => {
		appendFileSync(join(root, "tracked.txt"), "pre-existing dirt\n");
		const before = captureRepoState(root);
		let after = captureRepoState(root);
		let report = comparePhasePaths(before, after, [".artifacts/demo/REVIEW.md"], root);
		assert.equal(report.violated, false);

		appendFileSync(join(root, "tracked.txt"), "phase edit\n");
		after = captureRepoState(root);
		report = comparePhasePaths(before, after, [".artifacts/demo/REVIEW.md"], root);
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["tracked.txt"]);
	});
});

test("absolute artifact paths normalize against the repository root", () => {
	withTempRepo((root) => {
		const before = captureRepoState(root);
		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		writeFileSync(join(root, ".artifacts", "demo", "REVIEW.md"), "review\n");
		const after = captureRepoState(root);
		const report = comparePhasePaths(
			before,
			after,
			[join(root, ".artifacts/demo/REVIEW.md")],
			root,
		);
		assert.equal(report.violated, false);
	});
});

test("legacy dirty-path-only RepoState values remain comparable", () => {
	const before = {
		changedPaths: ["tracked.txt"],
		signatures: new Map([["tracked.txt", "before"]]),
	};
	const unchanged = {
		changedPaths: ["tracked.txt"],
		signatures: new Map([["tracked.txt", "before"]]),
	};
	assert.equal(
		comparePhasePaths(before, unchanged, [".artifacts/demo/PLAN.md"], "/tmp").violated,
		false,
	);

	const changed = {
		changedPaths: ["tracked.txt"],
		signatures: new Map([["tracked.txt", "after"]]),
	};
	assert.deepEqual(
		comparePhasePaths(before, changed, [".artifacts/demo/PLAN.md"], "/tmp").unexpectedPaths,
		["tracked.txt"],
	);
});

// ── phase artifacts (T7) ──

test("phaseArtifactForPhase maps artifact phases and exempts the implementer", () => {
	assert.equal(phaseArtifactForPhase("planner"), "PLAN.md");
	assert.equal(phaseArtifactForPhase("task-writer"), "TASKS.md");
	assert.equal(phaseArtifactForPhase("reviewer"), "REVIEW.md");
	assert.equal(phaseArtifactForPhase("implementer"), undefined);
	assert.equal(phaseArtifactForPhase("worker"), undefined);
	assert.equal(phaseArtifactForPhase("unknown-phase"), undefined);
});

test("resolveGitRoot finds the repository root from a nested directory and fails closed outside", () => {
	withTempRepo((root) => {
		mkdirSync(join(root, "src", "deep"), { recursive: true });
		assert.equal(resolveGitRoot(join(root, "src", "deep")), resolveGitRoot(root));
	});
	const outside = mkdtempSync(join(tmpdir(), "pi-phase-nogit-"));
	try {
		assert.equal(resolveGitRoot(outside), null);
	} finally {
		rmSync(outside, { recursive: true, force: true });
	}
});

test("capturePhaseBoundarySnapshot returns undefined for implementer and non-repo directories", () => {
	withTempRepo((root) => {
		assert.equal(capturePhaseBoundarySnapshot("implementer", root), undefined);
	});
	const outside = mkdtempSync(join(tmpdir(), "pi-phase-nogit-"));
	try {
		assert.equal(capturePhaseBoundarySnapshot("reviewer", outside), undefined);
	} finally {
		rmSync(outside, { recursive: true, force: true });
	}
});

test("comparePhaseArtifact keeps the legacy basename fallback for unwired callers", () => {
	withTempRepo((root) => {
		const before = captureRepoState(root);
		mkdirSync(join(root, "docs", "plan-a"), { recursive: true });
		writeFileSync(join(root, "docs", "plan-a", "PLAN.md"), "plan\n");
		let report = comparePhaseArtifact(before, captureRepoState(root), "PLAN.md");
		assert.equal(report.violated, false);
		// Backward compatibility for index.ts until it passes the exact path.
		assert.ok(report.allowedPaths.every((path) => path.endsWith("PLAN.md")));

		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "index.ts"), "code\n");
		report = comparePhaseArtifact(before, captureRepoState(root), "PLAN.md");
		assert.equal(report.violated, true);
		assert.deepEqual(report.unexpectedPaths, ["src/index.ts"]);
	});
});

test("exact artifact paths reject same-named files elsewhere", () => {
	withTempRepo((root) => {
		const expected = ".artifacts/demo/PLAN.md";
		const before = captureRepoState(root);
		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		mkdirSync(join(root, "docs", "plan-a"), { recursive: true });
		writeFileSync(join(root, expected), "expected\n");
		writeFileSync(join(root, "docs", "plan-a", "PLAN.md"), "unexpected\n");

		const report = comparePhaseArtifact(
			before,
			captureRepoState(root),
			"PLAN.md",
			expected,
			root,
		);
		assert.equal(report.violated, true);
		assert.deepEqual(report.allowedPaths, [expected]);
		assert.deepEqual(report.unexpectedPaths, ["docs/plan-a/PLAN.md"]);
	});
});

test("phase snapshots accept and normalize an exact expected artifact path", () => {
	withTempRepo((root) => {
		const expected = join(root, ".artifacts", "demo", "TASKS.md");
		const snapshot = capturePhaseBoundarySnapshot("task-writer", root, expected);
		assert.ok(snapshot);
		assert.equal(snapshot.expectedArtifactPath, ".artifacts/demo/TASKS.md");

		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		writeFileSync(expected, "tasks\n");
		const outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, false);
		assert.deepEqual(outcome.allowedPaths, [".artifacts/demo/TASKS.md"]);
	});
});

test("comparePhaseArtifact flags a deleted tracked path and a renamed artifact sibling", () => {
	withTempRepo((root) => {
		const before = captureRepoState(root);
		rmSync(join(root, "tracked.txt"));
		let report = comparePhaseArtifact(before, captureRepoState(root), "REVIEW.md");
		assert.equal(report.violated, true);
		assert.ok(report.unexpectedPaths.includes("tracked.txt"));

		// A leftover file next to the artifact is unexpected even after the artifact exists.
		mkdirSync(join(root, "docs", "plan-a"), { recursive: true });
		writeFileSync(join(root, "docs", "plan-a", "REVIEW.md"), "review\n");
		writeFileSync(join(root, "docs", "plan-a", "notes.txt"), "notes\n");
		report = comparePhaseArtifact(before, captureRepoState(root), "REVIEW.md");
		assert.equal(report.violated, true);
		assert.ok(report.unexpectedPaths.includes("tracked.txt"));
		assert.ok(report.unexpectedPaths.includes("docs/plan-a/notes.txt"));
	});
});

test("index-only staging is a violation even for the expected artifact", () => {
	withTempRepo((root) => {
		const expected = "docs/PLAN.md";
		mkdirSync(join(root, "docs"), { recursive: true });
		writeFileSync(join(root, expected), "pre-existing dirty artifact\n");
		const snapshot = capturePhaseBoundarySnapshot("planner", root, expected);
		assert.ok(snapshot);

		execFileSync("git", ["add", expected], { cwd: root });
		const statusBefore = execFileSync(
			"git",
			["status", "--porcelain=v1", "--untracked-files=all"],
			{ cwd: root, encoding: "utf8" },
		);
		const outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, true);
		assert.ok(outcome.unexpectedPaths.includes(expected));
		assert.equal(
			execFileSync(
				"git",
				["status", "--porcelain=v1", "--untracked-files=all"],
				{ cwd: root, encoding: "utf8" },
			),
			statusBefore,
			"evaluation must leave the staged state intact",
		);
	});
});

test("HEAD changes and committed paths are violations without reverting the commit", () => {
	withTempRepo((root) => {
		const snapshot = capturePhaseBoundarySnapshot(
			"reviewer",
			root,
			".artifacts/demo/REVIEW.md",
		);
		assert.ok(snapshot);
		appendFileSync(join(root, "tracked.txt"), "committed by reviewer\n");
		execFileSync("git", ["add", "tracked.txt"], { cwd: root });
		execFileSync(
			"git",
			["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "unexpected"],
			{ cwd: root, stdio: "ignore" },
		);
		const headAfterCommit = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: root,
			encoding: "utf8",
		}).trim();

		const outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, true);
		assert.ok(outcome.unexpectedPaths.includes("<repository HEAD>"));
		assert.ok(outcome.unexpectedPaths.includes("tracked.txt"));
		assert.equal(
			execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
			headAfterCommit,
			"evaluation must not reset the commit",
		);
	});
});

test("rename snapshots retain both source and destination paths", () => {
	withTempRepo((root) => {
		const expected = ".artifacts/demo/PLAN.md";
		mkdirSync(join(root, ".artifacts", "demo"), { recursive: true });
		const snapshot = capturePhaseBoundarySnapshot("planner", root, expected);
		assert.ok(snapshot);

		execFileSync("git", ["mv", "tracked.txt", expected], { cwd: root });
		const after = captureRepoState(root);
		assert.ok(after.changedPaths.includes("tracked.txt"));
		assert.ok(after.changedPaths.includes(expected));

		const outcome = evaluatePhaseBoundarySnapshot(snapshot, after);
		assert.ok(outcome);
		assert.equal(outcome.violated, true);
		assert.ok(outcome.unexpectedPaths.includes("tracked.txt"));
		assert.ok(outcome.unexpectedPaths.includes(expected));
		assert.ok(existsSync(join(root, expected)));
		assert.equal(existsSync(join(root, "tracked.txt")), false);
	});
});

test("phase snapshots compare against the initial dirty state, not a clean worktree", () => {
	withTempRepo((root) => {
		appendFileSync(join(root, "tracked.txt"), "pre-existing dirt\n");
		writeFileSync(join(root, "old-dirt.ts"), "already here\n");

		const snapshot = capturePhaseBoundarySnapshot(
			"task-writer",
			root,
			"docs/plan-a/TASKS.md",
		);
		assert.ok(snapshot);
		assert.equal(snapshot.artifact, "TASKS.md");
		assert.equal(snapshot.expectedArtifactPath, "docs/plan-a/TASKS.md");
		assert.ok(snapshot.before.changedPaths.includes("tracked.txt"));
		assert.ok(snapshot.before.changedPaths.includes("old-dirt.ts"));

		// Phase writes only its artifact; the untouched dirt is not a violation.
		mkdirSync(join(root, "docs", "plan-a"), { recursive: true });
		writeFileSync(join(root, "docs", "plan-a", "TASKS.md"), "tasks\n");
		let outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, false);
		assert.deepEqual(outcome.unexpectedPaths, []);

		// The phase editing pre-existing dirt is a violation.
		appendFileSync(join(root, "tracked.txt"), "phase edit\n");
		outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, true);
		assert.deepEqual(outcome.unexpectedPaths, ["tracked.txt"]);
	});
});

test("a phase snapshot works from a nested cwd and reports repository-relative paths", () => {
	withTempRepo((root) => {
		const nested = join(root, "src");
		mkdirSync(nested);
		const snapshot = capturePhaseBoundarySnapshot(
			"reviewer",
			nested,
			join(root, ".artifacts", "demo", "REVIEW.md"),
		);
		assert.ok(snapshot);
		assert.equal(snapshot.repoRoot, resolveGitRoot(root));

		writeFileSync(join(root, "src", "index.ts"), "code\n");
		const outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, true);
		assert.deepEqual(outcome.unexpectedPaths, ["src/index.ts"]);
	});
});

test("evaluating a violated boundary preserves the tree: no revert, stage, or content change", () => {
	withTempRepo((root) => {
		const snapshot = capturePhaseBoundarySnapshot("planner", root);
		assert.ok(snapshot);
		appendFileSync(join(root, "tracked.txt"), "rogue phase edit\n");
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "rogue.ts"), "rogue\n");
		mkdirSync(join(root, "docs"), { recursive: true });
		writeFileSync(join(root, "docs", "PLAN.md"), "plan\n");

		const statusBefore = execFileSync(
			"git",
			["-C", root, "status", "--porcelain", "--untracked-files=all"],
			{ encoding: "utf8" },
		);
		const outcome = evaluatePhaseBoundarySnapshot(snapshot);
		assert.ok(outcome);
		assert.equal(outcome.violated, true);
		assert.ok(outcome.unexpectedPaths.includes("tracked.txt"));
		assert.ok(outcome.unexpectedPaths.includes("src/rogue.ts"));

		const statusAfter = execFileSync(
			"git",
			["-C", root, "status", "--porcelain", "--untracked-files=all"],
			{ encoding: "utf8" },
		);
		assert.equal(statusAfter, statusBefore, "evaluation must not change git status");
		const staged = execFileSync("git", ["-C", root, "diff", "--cached", "--name-only"], {
			encoding: "utf8",
		});
		assert.equal(staged.trim(), "", "evaluation must not stage anything");
		assert.equal(
			readFileSync(join(root, "tracked.txt"), "utf8"),
			"initial\nrogue phase edit\n",
			"changes stay exactly as the phase left them",
		);
		assert.ok(existsSync(join(root, "docs", "PLAN.md")));
	});
});

test("formatPhaseBoundaryViolation names the phase, artifact, exact paths, and the no-revert rule", () => {
	const text = formatPhaseBoundaryViolation({
		phaseLabel: "Reviewer",
		artifact: "REVIEW.md",
		report: {
			allowedPaths: ["docs/plan-a/REVIEW.md"],
			unexpectedPaths: ["src/index.ts", "tracked.txt"],
			violated: true,
		},
	});
	assert.match(text, /PHASE BOUNDARY VIOLATION/);
	assert.match(text, /Reviewer phase changed paths outside its expected artifact \(REVIEW\.md\)/);
	assert.match(text, /- src\/index\.ts/);
	assert.match(text, /- tracked\.txt/);
	assert.match(text, /Report these exact paths to the user/);
	assert.match(text, /Do not revert, restore, delete, stage, or commit anything/);
});
