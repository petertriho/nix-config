import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";

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
	/** Direct fingerprints for declared boundary files, including ignored files. */
	boundaryFileSignatures?: Map<string, string>;
	/** Recursive fingerprints for initialized Git submodules. */
	submoduleSignatures?: Map<string, string>;
}

export interface RepoFileConstraint {
	readonly under: string;
	readonly basename?: string;
}

export interface RepoBoundaryWorktreeRule {
	readonly capability: "worktree";
	readonly kind: "worktree";
}

export interface RepoBoundaryExactFileRule {
	readonly capability?: string;
	readonly kind: "file";
	readonly slotId?: string;
	readonly label?: string;
	readonly exactPath: string;
}

export interface RepoBoundaryConstrainedFileRule {
	readonly capability?: string;
	readonly kind: "file";
	readonly slotId?: string;
	readonly label?: string;
	readonly constraint: RepoFileConstraint;
}

export type RepoBoundaryFileRule =
	| RepoBoundaryExactFileRule
	| RepoBoundaryConstrainedFileRule;

export type RepoBoundaryAllowedRule =
	| RepoBoundaryWorktreeRule
	| RepoBoundaryFileRule;

export interface RepoBoundaryDefinition {
	readonly allowedRules: readonly RepoBoundaryAllowedRule[];
	readonly protectedRules: readonly RepoBoundaryFileRule[];
}

export interface RepoBoundarySnapshot extends RepoBoundaryDefinition {
	readonly repoRoot: string;
	readonly before: RepoState;
}

export interface RepoBoundaryReport extends RepoBoundaryDefinition {
	allowedPaths: string[];
	unexpectedPaths: string[];
	violated: boolean;
	/** Set when post-run repository state could not be captured safely. */
	manualReviewReason?: string;
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
	const absolute = resolve(root, path);
	if (!existsSync(absolute)) return "missing";

	try {
		return createHash("sha256").update(readFileSync(absolute)).digest("hex");
	} catch {
		return "unreadable";
	}
}

function sortedMapEntries(map: Map<string, string> | undefined): [string, string][] {
	return [...(map ?? new Map<string, string>()).entries()].sort(([first], [second]) =>
		compareStrings(first, second)
	);
}

function repoStateSignature(state: RepoState): string {
	return createHash("sha256")
		.update(JSON.stringify({
			changedPaths: state.changedPaths,
			signatures: sortedMapEntries(state.signatures),
			head: state.head,
			headEntries: sortedMapEntries(state.headEntries),
			indexEntries: sortedMapEntries(state.indexEntries),
			statusSignatures: sortedMapEntries(state.statusSignatures),
			submoduleSignatures: sortedMapEntries(state.submoduleSignatures),
		}))
		.digest("hex");
}

function isGitlinkEntry(entry: string): boolean {
	return entry.startsWith("160000 ");
}

function captureSubmoduleSignatures(
	root: string,
	indexEntries: Map<string, string>,
): Map<string, string> {
	const signatures = new Map<string, string>();
	for (const [path, entry] of indexEntries) {
		if (!isGitlinkEntry(entry)) continue;
		const submoduleRoot = resolve(root, path);
		if (!existsSync(join(submoduleRoot, ".git"))) {
			signatures.set(path, "uninitialized");
			continue;
		}
		signatures.set(path, repoStateSignature(captureRepoState(submoduleRoot)));
	}
	return signatures;
}

function collectConstrainedFiles(
	repoRoot: string,
	constraint: RepoFileConstraint,
): string[] {
	const under = resolve(repoRoot, constraint.under);
	if (!isContainedPath(repoRoot, under) || !existsSync(under)) return [];
	const paths: string[] = [];
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name === ".git") continue;
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				visit(absolute);
				continue;
			}
			if (constraint.basename !== undefined && entry.name !== constraint.basename) continue;
			paths.push(normalizeRepoPath(repoRoot, absolute));
		}
	};
	visit(under);
	return paths;
}

function captureBoundaryFileSignatures(
	root: string,
	definition: RepoBoundaryDefinition | undefined,
): Map<string, string> | undefined {
	if (!definition) return undefined;
	const paths = new Set<string>();
	for (const rule of [...definition.allowedRules, ...definition.protectedRules]) {
		if (rule.kind !== "file") continue;
		if ("exactPath" in rule) {
			const path = normalizeRepoPath(root, rule.exactPath);
			if (isContainedPath(root, resolve(root, path))) paths.add(path);
			continue;
		}
		for (const path of collectConstrainedFiles(root, rule.constraint)) paths.add(path);
	}
	const signatures = new Map<string, string>();
	for (const path of paths) signatures.set(path, fileSignature(root, path));
	return signatures;
}

/**
 * Snapshot the repository's changed and untracked paths. Uses
 * `--untracked-files=all` so untracked files inside new directories are
 * listed individually instead of collapsed to `dir/`, keeping the
 * before/after comparison deterministic across environments.
 */
export function captureRepoState(
	root: string,
	definition?: RepoBoundaryDefinition,
): RepoState {
	const head = captureHead(root);
	const headEntries = captureHeadEntries(root, head);
	const indexEntries = captureIndexEntries(root);
	const status = parseStatus(
		gitOutput(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
	);
	const signatures = new Map<string, string>();
	for (const path of status.changedPaths) signatures.set(path, fileSignature(root, path));
	const boundaryFileSignatures = captureBoundaryFileSignatures(root, definition);
	const submoduleSignatures = captureSubmoduleSignatures(root, indexEntries);
	return {
		changedPaths: status.changedPaths,
		signatures,
		head,
		headEntries,
		indexEntries,
		statusSignatures: status.statusSignatures,
		boundaryFileSignatures,
		submoduleSignatures,
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

function hasGitMetadataAncestor(startDir: string): boolean {
	let current = resolve(startDir);
	while (true) {
		if (existsSync(join(current, ".git"))) return true;
		const parent = dirname(current);
		if (parent === current) return false;
		current = parent;
	}
}

/**
 * Capture a generic repo-write boundary snapshot. Undefined outside a Git
 * repository; repository-state read failures throw so callers fail closed.
 */
export function captureRepoBoundarySnapshot(
	startDir: string,
	definition: RepoBoundaryDefinition,
): RepoBoundarySnapshot | undefined {
	const repoRoot = resolveGitRoot(startDir);
	if (!repoRoot) {
		if (hasGitMetadataAncestor(startDir)) {
			throw new Error(
				`Could not resolve the Git repository root for boundary capture at "${startDir}".`,
			);
		}
		return undefined;
	}
	const normalized = normalizeRepoBoundaryDefinition(definition, repoRoot);
	try {
		const before = captureRepoState(repoRoot, normalized);
		return {
			repoRoot,
			before,
			allowedRules: normalized.allowedRules,
			protectedRules: normalized.protectedRules,
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Could not capture the repository boundary baseline at "${repoRoot}": ${detail}`,
		);
	}
}

/**
 * Compare a generic boundary baseline with the repository state after the
 * child finishes. Read-only: never reverts, restores, stages, or commits.
 */
export function evaluateRepoBoundarySnapshot(
	snapshot: RepoBoundarySnapshot,
	after?: RepoState,
): RepoBoundaryReport {
	let afterState: RepoState;
	try {
		afterState = after ?? captureRepoState(snapshot.repoRoot, snapshot);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			allowedRules: snapshot.allowedRules,
			protectedRules: snapshot.protectedRules,
			allowedPaths: [],
			unexpectedPaths: [],
			violated: true,
			manualReviewReason:
				`Post-run repository state capture failed; manual review is required: ${detail}`,
		};
	}
	return compareRepoBoundaryRules(snapshot.before, afterState, snapshot, snapshot.repoRoot);
}

function isContainedPath(parent: string, child: string): boolean {
	const relativePath = relative(resolve(parent), resolve(child));
	return relativePath === "" || !relativePath.split(sep).includes("..");
}

function normalizeRepoPath(root: string, path: string): string {
	const cwdRoot = resolve(root);
	const resolvedPath = isAbsolute(path) ? resolve(path) : path;
	if (isAbsolute(resolvedPath)) {
		const repoRelative = relative(cwdRoot, resolvedPath);
		if (!repoRelative.startsWith("..") && repoRelative !== "..") {
			return (repoRelative || ".").split(sep).join("/");
		}
	}
	return resolvedPath.replace(/^\.\//, "").split(sep).join("/");
}

function normalizeRepoConstraint(root: string, constraint: RepoFileConstraint): RepoFileConstraint {
	const normalizedUnder = normalizeRepoPath(root, resolve(root, constraint.under)) || ".";
	return constraint.basename === undefined
		? { under: normalizedUnder }
		: { under: normalizedUnder, basename: constraint.basename };
}

function normalizeRepoBoundaryDefinition(
	definition: RepoBoundaryDefinition,
	repoRoot: string,
): RepoBoundaryDefinition {
	return {
		allowedRules: definition.allowedRules.map((rule) => {
			if (rule.kind === "worktree") return rule;
			return "exactPath" in rule
				? {
					...rule,
					exactPath: normalizeRepoPath(repoRoot, rule.exactPath),
				}
				: {
					...rule,
					constraint: normalizeRepoConstraint(repoRoot, rule.constraint),
				};
		}),
		protectedRules: definition.protectedRules.map((rule) =>
			"exactPath" in rule
				? {
					...rule,
					exactPath: normalizeRepoPath(repoRoot, rule.exactPath),
				}
				: {
					...rule,
					constraint: normalizeRepoConstraint(repoRoot, rule.constraint),
				}
		),
	};
}

function matchesRepoBoundaryFileRule(
	path: string,
	rule: RepoBoundaryFileRule,
	repoRoot: string,
): boolean {
	const normalizedPath = normalizeRepoPath(repoRoot, path);
	if ("exactPath" in rule) return normalizedPath === normalizeRepoPath(repoRoot, rule.exactPath);
	const absolutePath = resolve(repoRoot, normalizedPath);
	const allowedRoot = resolve(repoRoot, rule.constraint.under);
	if (!isContainedPath(allowedRoot, absolutePath)) return false;
	return rule.constraint.basename === undefined || basename(absolutePath) === rule.constraint.basename;
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

function pathChangedDuringBoundary(path: string, before: RepoState, after: RepoState): boolean {
	const beforeHash = before.signatures.get(path) ?? "clean";
	const afterHash = after.signatures.get(path) ?? "clean";
	const beforeBoundaryHash = before.boundaryFileSignatures?.get(path) ?? "not-declared";
	const afterBoundaryHash = after.boundaryFileSignatures?.get(path) ?? "not-declared";
	const beforeSubmoduleHash = before.submoduleSignatures?.get(path) ?? "not-submodule";
	const afterSubmoduleHash = after.submoduleSignatures?.get(path) ?? "not-submodule";
	const wasChanged = before.changedPaths.includes(path);
	const isChanged = after.changedPaths.includes(path);
	const beforeStatus = before.statusSignatures?.get(path) ?? (wasChanged ? "changed" : "clean");
	const afterStatus = after.statusSignatures?.get(path) ?? (isChanged ? "changed" : "clean");
	return (
		wasChanged !== isChanged
		|| beforeHash !== afterHash
		|| beforeStatus !== afterStatus
		|| beforeBoundaryHash !== afterBoundaryHash
		|| beforeSubmoduleHash !== afterSubmoduleHash
	);
}

/**
 * Net repository changes during the boundary. Worktree/status changes are
 * relative to the dirty baseline. Index and HEAD changes are separately
 * marked as forced violations, even when they affect an explicitly allowed
 * file.
 */
function changesDuringBoundary(before: RepoState, after: RepoState): RepoChanges {
	const allPaths = new Set([
		...before.changedPaths,
		...after.changedPaths,
		...(before.boundaryFileSignatures?.keys() ?? []),
		...(after.boundaryFileSignatures?.keys() ?? []),
		...(before.submoduleSignatures?.keys() ?? []),
		...(after.submoduleSignatures?.keys() ?? []),
	]);
	const changed = new Set<string>();
	for (const path of allPaths) if (pathChangedDuringBoundary(path, before, after)) changed.add(path);

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

export function compareRepoBoundaryRules(
	before: RepoState,
	after: RepoState,
	definition: RepoBoundaryDefinition,
	repoRoot = process.cwd(),
): RepoBoundaryReport {
	const normalized = normalizeRepoBoundaryDefinition(definition, repoRoot);
	const changes = changesDuringBoundary(before, after);
	const explicitFileRules = normalized.allowedRules.filter((rule) => rule.kind === "file");
	const hasWorktree = normalized.allowedRules.some((rule) => rule.kind === "worktree");
	const allowed = new Set<string>();
	const unusual = new Set<string>();
	for (const path of changes.paths) {
		if (changes.forcedUnexpectedPaths.has(path) || path === HEAD_CHANGE_MARKER) {
			unusual.add(path);
			continue;
		}
		if (explicitFileRules.some((rule) => matchesRepoBoundaryFileRule(path, rule, repoRoot))) {
			allowed.add(normalizeRepoPath(repoRoot, path));
			continue;
		}
		if (
			hasWorktree
			&& !normalized.protectedRules.some((rule) => matchesRepoBoundaryFileRule(path, rule, repoRoot))
		) {
			allowed.add(normalizeRepoPath(repoRoot, path));
			continue;
		}
		unusual.add(normalizeRepoPath(repoRoot, path));
	}
	return {
		allowedRules: normalized.allowedRules,
		protectedRules: normalized.protectedRules,
		allowedPaths: [...allowed].sort(compareStrings),
		unexpectedPaths: [...unusual].sort(compareStrings),
		violated: unusual.size > 0,
	};
}
