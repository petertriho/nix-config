import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface RepoState {
	changedPaths: string[];
	signatures: Map<string, string>;
	/**
	 * Extended Git state captured by current snapshots. Optional so callers
	 * holding the original dirty-path-only shape remain compatible.
	 */
	head?: string;
	headEntries?: Map<string, string>;
	indexEntries?: Map<string, string>;
	statusSignatures?: Map<string, string>;
}

export interface PhasePostconditionReport {
	allowedPaths: string[];
	unexpectedPaths: string[];
	violated: boolean;
}

/** The only artifact each non-implementation workflow phase may change. */
export type PhaseArtifact = "PLAN.md" | "TASKS.md" | "REVIEW.md";

const PHASE_ARTIFACTS: Record<string, PhaseArtifact> = {
	planner: "PLAN.md",
	"task-writer": "TASKS.md",
	reviewer: "REVIEW.md",
};

/** Artifact a workflow phase permits, or undefined for phases without one. */
export function phaseArtifactForPhase(phase: string): PhaseArtifact | undefined {
	return PHASE_ARTIFACTS[phase];
}

const HEAD_CHANGE_MARKER = "<repository HEAD>";

interface ParsedStatus {
	changedPaths: string[];
	statusSignatures: Map<string, string>;
}

/**
 * Parse porcelain v1 `-z` output. In NUL mode rename/copy records are emitted
 * as `XY destination\0source\0`; retain both paths so an allowed destination
 * can never conceal deletion of an unrelated source.
 */
function parseStatus(output: string): ParsedStatus {
	const fields = output.split("\0");
	const statusSignatures = new Map<string, string>();
	for (let index = 0; index < fields.length; index += 1) {
		const field = fields[index];
		if (!field) continue;
		const status = field.slice(0, 2);
		const path = field.slice(3);
		const renamedOrCopied = status.includes("R") || status.includes("C");
		if (renamedOrCopied) {
			const sourcePath = fields[index + 1];
			if (sourcePath) {
				statusSignatures.set(path, `${status}:destination:${sourcePath}`);
				statusSignatures.set(sourcePath, `${status}:source:${path}`);
				index += 1;
				continue;
			}
		}
		statusSignatures.set(path, status);
	}
	return {
		changedPaths: [...statusSignatures.keys()].sort(compareStrings),
		statusSignatures,
	};
}

function parseTabbedEntries(output: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const record of output.split("\0")) {
		if (!record) continue;
		const separator = record.indexOf("\t");
		if (separator < 0) continue;
		entries.set(record.slice(separator + 1), record.slice(0, separator));
	}
	return entries;
}

function gitOutput(root: string, args: string[]): string {
	return execFileSync("git", ["-C", root, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
}

function captureHead(root: string): string {
	try {
		return gitOutput(root, ["rev-parse", "--verify", "HEAD"]).trim();
	} catch {
		return "UNBORN";
	}
}

function captureHeadEntries(root: string, head: string): Map<string, string> {
	if (head === "UNBORN") return new Map();
	return parseTabbedEntries(gitOutput(root, ["ls-tree", "-r", "-z", "--full-tree", head]));
}

function captureIndexEntries(root: string): Map<string, string> {
	return parseTabbedEntries(gitOutput(root, ["ls-files", "--stage", "-z"]));
}

function fileSignature(root: string, path: string): string {
	const absolute = join(root, path);
	if (!existsSync(absolute)) return "missing";

	try {
		return createHash("sha256").update(readFileSync(absolute)).digest("hex");
	} catch {
		return "unreadable";
	}
}

/**
 * Snapshot the repository's changed and untracked paths. Uses
 * `--untracked-files=all` so untracked files inside new directories are
 * listed individually instead of collapsed to `dir/`, keeping the
 * before/after comparison deterministic across environments.
 */
export function captureRepoState(root: string): RepoState {
	const head = captureHead(root);
	const headEntries = captureHeadEntries(root, head);
	const indexEntries = captureIndexEntries(root);
	const status = parseStatus(
		gitOutput(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
	);
	const signatures = new Map<string, string>();
	for (const path of status.changedPaths) signatures.set(path, fileSignature(root, path));
	return {
		changedPaths: status.changedPaths,
		signatures,
		head,
		headEntries,
		indexEntries,
		statusSignatures: status.statusSignatures,
	};
}

/** Git repository root for a starting directory, or null outside a repository. */
export function resolveGitRoot(startDir: string): string | null {
	try {
		const output = execFileSync("git", ["-C", startDir, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
		});
		const root = output.trim();
		return root ? resolve(root) : null;
	} catch {
		return null;
	}
}

/**
 * Phase-relative baseline captured before a phase child starts working.
 * Undefined when the phase has no expected artifact (implementer) or the
 * directory is not inside a git repository; those phases run unchecked.
 */
export interface PhaseBoundarySnapshot {
	phase: string;
	artifact: PhaseArtifact;
	repoRoot: string;
	before: RepoState;
	/**
	 * Exact repo-relative artifact path when the orchestrator knows it.
	 * Omitted callers retain the legacy basename fallback until parent wiring
	 * supplies PLAN/TASKS/REVIEW paths.
	 */
	expectedArtifactPath?: string;
}

/**
 * Capture the phase-boundary baseline before a workflow phase launches.
 * Read-only: takes a git status snapshot and never touches the worktree.
 */
export function capturePhaseBoundarySnapshot(
	phase: string,
	startDir: string,
	expectedArtifactPath?: string,
): PhaseBoundarySnapshot | undefined {
	const artifact = phaseArtifactForPhase(phase);
	if (!artifact) return undefined;
	const repoRoot = resolveGitRoot(startDir);
	if (!repoRoot) return undefined;
	let before: RepoState;
	try {
		before = captureRepoState(repoRoot);
	} catch {
		return undefined;
	}
	return {
		phase,
		artifact,
		repoRoot,
		before,
		...(expectedArtifactPath
			? { expectedArtifactPath: normalizeWorkflowPath(repoRoot, expectedArtifactPath) }
			: {}),
	};
}

/**
 * Compare the baseline with the repository state after the phase. Read-only:
 * the reported changes stay exactly as the child left them. Returns undefined
 * when the after state cannot be read (never fails closed on a git error).
 */
export function evaluatePhaseBoundarySnapshot(
	snapshot: PhaseBoundarySnapshot,
	after?: RepoState,
): PhasePostconditionReport | undefined {
	let afterState: RepoState;
	try {
		afterState = after ?? captureRepoState(snapshot.repoRoot);
	} catch {
		return undefined;
	}
	return comparePhaseArtifact(
		snapshot.before,
		afterState,
		snapshot.artifact,
		snapshot.expectedArtifactPath,
		snapshot.repoRoot,
	);
}

function normalizeWorkflowPath(root: string, path: string): string {
	const cwdRoot = resolve(root);
	const resolvedPath = isAbsolute(path) ? resolve(path) : path;
	if (isAbsolute(resolvedPath)) {
		const repoRelative = relative(cwdRoot, resolvedPath);
		if (!repoRelative.startsWith("..") && repoRelative !== "..") {
			return repoRelative.split(sep).join("/");
		}
	}
	return resolvedPath.replace(/^\.\//, "").split(sep).join("/");
}

function pathBasename(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1];
}

function compareStrings(first: string, second: string): number {
	return first.localeCompare(second);
}

interface RepoChanges {
	paths: string[];
	forcedUnexpectedPaths: Set<string>;
}

function changedMapPaths(
	before: Map<string, string> | undefined,
	after: Map<string, string> | undefined,
): string[] {
	const first = before ?? new Map<string, string>();
	const second = after ?? new Map<string, string>();
	const paths = new Set([...first.keys(), ...second.keys()]);
	return [...paths].filter((path) => first.get(path) !== second.get(path));
}

/**
 * Net repository changes during the phase. Worktree/status changes are
 * relative to the dirty baseline. Index and HEAD changes are separately
 * marked as forced violations, even when they affect the allowed artifact.
 */
function changesDuringPhase(before: RepoState, after: RepoState): RepoChanges {
	const allPaths = new Set([...before.changedPaths, ...after.changedPaths]);
	const changed = new Set<string>();
	for (const path of allPaths) {
		const beforeHash = before.signatures.get(path) ?? "clean";
		const afterHash = after.signatures.get(path) ?? "clean";
		const wasChanged = before.changedPaths.includes(path);
		const isChanged = after.changedPaths.includes(path);
		const beforeStatus = before.statusSignatures?.get(path) ?? (wasChanged ? "changed" : "clean");
		const afterStatus = after.statusSignatures?.get(path) ?? (isChanged ? "changed" : "clean");
		if (
			wasChanged !== isChanged
			|| beforeHash !== afterHash
			|| beforeStatus !== afterStatus
		) {
			changed.add(path);
		}
	}

	const indexPaths = changedMapPaths(before.indexEntries, after.indexEntries);
	const headPaths = changedMapPaths(before.headEntries, after.headEntries);
	for (const path of [...indexPaths, ...headPaths]) changed.add(path);

	const forcedUnexpectedPaths = new Set([...indexPaths, ...headPaths]);
	if (
		before.head !== undefined
		&& after.head !== undefined
		&& before.head !== after.head
	) {
		changed.add(HEAD_CHANGE_MARKER);
		forcedUnexpectedPaths.add(HEAD_CHANGE_MARKER);
	}

	return {
		paths: [...changed].sort(compareStrings),
		forcedUnexpectedPaths,
	};
}

export function comparePhasePaths(
	before: RepoState,
	after: RepoState,
	allowedPaths: readonly string[],
	repoRoot = process.cwd(),
): PhasePostconditionReport {
	const allowed = new Set([...allowedPaths].map((path) => normalizeWorkflowPath(repoRoot, path)));
	const changes = changesDuringPhase(before, after);
	const unusual = changes.paths.filter(
		(path) =>
			changes.forcedUnexpectedPaths.has(path)
			|| !allowed.has(normalizeWorkflowPath(repoRoot, path)),
	);
	return {
		allowedPaths: [...allowed].sort(compareStrings),
		unexpectedPaths: unusual.sort(compareStrings),
		violated: unusual.length > 0,
	};
}

/**
 * Phase postcondition against the phase's expected artifact. Pass
 * `expectedArtifactPath` to enforce one exact path. The three-argument form
 * keeps the legacy basename fallback for existing index.ts callers until the
 * parent wires structured workflow artifact paths.
 */
export function comparePhaseArtifact(
	before: RepoState,
	after: RepoState,
	artifact: string,
	expectedArtifactPath?: string,
	repoRoot = process.cwd(),
): PhasePostconditionReport {
	if (expectedArtifactPath) {
		return comparePhasePaths(before, after, [expectedArtifactPath], repoRoot);
	}

	const changes = changesDuringPhase(before, after);
	const allowed = changes.paths.filter(
		(path) =>
			!changes.forcedUnexpectedPaths.has(path)
			&& pathBasename(path) === artifact,
	);
	const unexpected = changes.paths.filter(
		(path) =>
			changes.forcedUnexpectedPaths.has(path)
			|| pathBasename(path) !== artifact,
	);
	return {
		allowedPaths: allowed,
		unexpectedPaths: unexpected,
		violated: unexpected.length > 0,
	};
}

/**
 * Orchestrator-facing stop instruction for a violated phase boundary. Lists
 * the exact unexpected paths and forbids reverting, staging, or committing:
 * every change is preserved for the user to review.
 */
export function formatPhaseBoundaryViolation(input: {
	phaseLabel: string;
	artifact: string;
	report: PhasePostconditionReport;
}): string {
	const paths = input.report.unexpectedPaths.map((path) => `- ${path}`).join("\n");
	return [
		`PHASE BOUNDARY VIOLATION — the ${input.phaseLabel} phase changed paths outside its expected artifact (${input.artifact}).`,
		"",
		`Unexpected changed paths:`,
		paths,
		"",
		"Stop the workflow now. Report these exact paths to the user and wait for their decision.",
		"Every change is preserved exactly as it is. Do not revert, restore, delete, stage, or commit anything,",
		"and do not launch the next phase.",
	].join("\n");
}
