import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync, type Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { loadWorkflowDefinitionFromPackage } from "./schema.ts";
import type {
	NormalizedWorkflowDefinition,
	WorkflowDiagnostic,
} from "./types.ts";

export const WORKFLOW_REGISTRY_SOURCES = ["bundled", "global", "project"] as const;
export type WorkflowRegistrySource = (typeof WORKFLOW_REGISTRY_SOURCES)[number];

export const WORKFLOW_ALIAS_STATUSES = [
	"available",
	"workflow-collision",
	"command-collision",
] as const;
export type WorkflowAliasStatus = (typeof WORKFLOW_ALIAS_STATUSES)[number];

export interface WorkflowRegistryExistingCommand {
	readonly name: string;
	readonly source: string;
	readonly description?: string;
}

export interface WorkflowRegistryAlias {
	readonly name: string;
	readonly status: WorkflowAliasStatus;
	readonly collidingWorkflowIds: readonly string[];
	readonly collidingCommands: readonly WorkflowRegistryExistingCommand[];
}

export interface WorkflowRegistryEntry {
	readonly id: string;
	readonly source: WorkflowRegistrySource;
	readonly packagePath: string;
	readonly manifestPath: string;
	readonly skillPath: string;
	readonly definition: NormalizedWorkflowDefinition;
	readonly alias: WorkflowRegistryAlias;
}

export interface WorkflowRegistrySourceDirectory {
	readonly source: WorkflowRegistrySource;
	readonly root: string;
	readonly enabled: boolean;
}

export interface WorkflowRegistryDiagnostic extends WorkflowDiagnostic {
	readonly kind: "discovery" | "package" | "alias";
	readonly source: WorkflowRegistrySource;
	readonly packagePath?: string;
	readonly workflowId?: string;
	readonly alias?: string;
}

export interface WorkflowRegistry {
	readonly sources: readonly WorkflowRegistrySourceDirectory[];
	readonly workflows: readonly WorkflowRegistryEntry[];
	readonly workflowById: Readonly<Record<string, WorkflowRegistryEntry>>;
	readonly aliases: Readonly<Record<string, string>>;
	readonly diagnostics: readonly WorkflowRegistryDiagnostic[];
}

export interface DiscoverWorkflowRegistryOptions {
	readonly projectRoot?: string;
	readonly projectTrusted?: boolean;
	readonly agentDir?: string;
	readonly bundledRoot?: string;
	readonly globalRoot?: string;
	readonly existingCommands?: readonly WorkflowRegistryExistingCommand[];
}

interface WorkflowScopeCandidate {
	readonly source: WorkflowRegistrySource;
	readonly definition: NormalizedWorkflowDefinition;
}

function freezeDeep<T>(value: T): T {
	if (Object(value) !== value || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(
		value as Record<string, boolean | number | object | string | null | undefined>,
	)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function canonicalizePath(path: string): string {
	const absolute = resolve(path);
	return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function canonicalProjectRoot(projectRoot: string): string {
	const canonicalCwd = canonicalizePath(projectRoot);
	try {
		const gitRoot = execFileSync(
			"git",
			["-C", canonicalCwd, "rev-parse", "--show-toplevel"],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		).trim();
		if (gitRoot) return canonicalizePath(gitRoot);
	} catch {
		// Non-Git directories intentionally fall back to their canonical cwd.
	}
	return canonicalCwd;
}

function defaultBundledWorkflowsRoot(): string {
	return canonicalizePath(fileURLToPath(new URL("../workflows/", import.meta.url)));
}

function defaultGlobalWorkflowsRoot(agentDir = getAgentDir()): string {
	return canonicalizePath(join(agentDir, "workflows"));
}

function defaultProjectWorkflowsRoot(projectRoot: string): string {
	return canonicalizePath(join(canonicalProjectRoot(projectRoot), CONFIG_DIR_NAME, "workflows"));
}

function listScopeDirectories(
	scope: WorkflowRegistrySourceDirectory,
	diagnostics: WorkflowRegistryDiagnostic[],
): string[] {
	if (!scope.enabled || !existsSync(scope.root)) return [];

	let rootStat: ReturnType<typeof statSync>;
	try {
		rootStat = statSync(scope.root);
	} catch (error) {
		diagnostics.push({
			kind: "discovery",
			source: scope.source,
			path: scope.root,
			message: `Unable to inspect workflow discovery directory: ${error instanceof Error ? error.message : String(error)}`,
		});
		return [];
	}
	if (!rootStat.isDirectory()) {
		diagnostics.push({
			kind: "discovery",
			source: scope.source,
			path: scope.root,
			message: "Workflow discovery path exists but is not a directory.",
		});
		return [];
	}

	let entries: Dirent[];
	try {
		entries = readdirSync(scope.root, { withFileTypes: true })
			.sort((first, second) => first.name.localeCompare(second.name));
	} catch (error) {
		diagnostics.push({
			kind: "discovery",
			source: scope.source,
			path: scope.root,
			message: `Unable to read workflow discovery directory: ${error instanceof Error ? error.message : String(error)}`,
		});
		return [];
	}

	const packagePaths: string[] = [];
	for (const entry of entries) {
		const packagePath = join(scope.root, entry.name);
		let isDirectory = entry.isDirectory();
		if (!isDirectory && entry.isSymbolicLink()) {
			try {
				isDirectory = statSync(packagePath).isDirectory();
			} catch (error) {
				diagnostics.push({
					kind: "discovery",
					source: scope.source,
					path: packagePath,
					message: `Unable to inspect workflow package candidate: ${error instanceof Error ? error.message : String(error)}`,
				});
				continue;
			}
		}
		if (!isDirectory) continue;
		if (existsSync(join(packagePath, "workflow.json"))) {
			packagePaths.push(packagePath);
		}
	}
	return packagePaths;
}

function normalizeExistingCommands(
	commands: readonly WorkflowRegistryExistingCommand[] | undefined,
): WorkflowRegistryExistingCommand[] {
	if (!commands) return [];
	const normalized: WorkflowRegistryExistingCommand[] = [];
	for (const command of commands) {
		const name = command.name.trim();
		if (name.length === 0) continue;
		const source = command.source.trim() || "unknown";
		normalized.push(
			command.description?.trim()
				? { name, source, description: command.description.trim() }
				: { name, source },
		);
	}
	return normalized;
}

function buildSources(options: DiscoverWorkflowRegistryOptions): WorkflowRegistrySourceDirectory[] {
	const projectRoot = options.projectRoot ?? process.cwd();
	return [
		{
			source: "bundled",
			root: options.bundledRoot ? canonicalizePath(options.bundledRoot) : defaultBundledWorkflowsRoot(),
			enabled: true,
		},
		{
			source: "global",
			root: options.globalRoot
				? canonicalizePath(options.globalRoot)
				: defaultGlobalWorkflowsRoot(options.agentDir),
			enabled: true,
		},
		{
			source: "project",
			root: defaultProjectWorkflowsRoot(projectRoot),
			enabled: options.projectTrusted ?? false,
		},
	];
}

function addAliasDiagnostics(
	entry: WorkflowScopeCandidate,
	alias: string,
	message: string,
	diagnostics: WorkflowRegistryDiagnostic[],
): void {
	diagnostics.push({
		kind: "alias",
		source: entry.source,
		packagePath: entry.definition.packagePath,
		workflowId: entry.definition.id,
		alias,
		path: entry.definition.manifestPath,
		message,
	});
}

export function discoverWorkflowRegistry(
	options: DiscoverWorkflowRegistryOptions = {},
): WorkflowRegistry {
	const sources = buildSources(options);
	const diagnostics: WorkflowRegistryDiagnostic[] = [];
	const candidates: WorkflowScopeCandidate[] = [];

	for (const source of sources) {
		const scopeCandidates: WorkflowScopeCandidate[] = [];
		for (const packagePath of listScopeDirectories(source, diagnostics)) {
			const loaded = loadWorkflowDefinitionFromPackage(packagePath);
			if (loaded.status === "invalid") {
				for (const diagnostic of loaded.diagnostics) {
					diagnostics.push({
						kind: "package",
						source: source.source,
						packagePath: canonicalizePath(packagePath),
						path: diagnostic.path,
						message: diagnostic.message,
					});
				}
				continue;
			}
			scopeCandidates.push({
				source: source.source,
				definition: loaded.definition,
			});
		}

		const candidatesById = new Map<string, WorkflowScopeCandidate[]>();
		for (const candidate of scopeCandidates) {
			const current = candidatesById.get(candidate.definition.id) ?? [];
			current.push(candidate);
			candidatesById.set(candidate.definition.id, current);
		}
		for (const workflowId of [...candidatesById.keys()].sort((first, second) =>
			first.localeCompare(second)
		)) {
			const sameIdCandidates = (candidatesById.get(workflowId) ?? [])
				.sort((first, second) =>
					first.definition.packagePath.localeCompare(second.definition.packagePath)
				);
			if (sameIdCandidates.length === 1) {
				candidates.push(sameIdCandidates[0]);
				continue;
			}

			const packagePaths = sameIdCandidates.map((candidate) => candidate.definition.packagePath);
			const message = `Duplicate workflow ID "${workflowId}" in ${source.source} scope: ${packagePaths.join(", ")}. No workflow from this scope was registered for this ID.`;
			for (const candidate of sameIdCandidates) {
				diagnostics.push({
					kind: "package",
					source: source.source,
					packagePath: candidate.definition.packagePath,
					workflowId,
					path: candidate.definition.manifestPath,
					message,
				});
			}
		}
	}

	const finalById = new Map<string, WorkflowScopeCandidate>();
	for (const candidate of candidates) {
		finalById.set(candidate.definition.id, candidate);
	}
	const finalEntries = [...finalById.values()]
		.sort((first, second) => first.definition.id.localeCompare(second.definition.id));

	const existingCommandsByName = new Map<string, WorkflowRegistryExistingCommand[]>();
	for (const command of normalizeExistingCommands(options.existingCommands)) {
		const current = existingCommandsByName.get(command.name) ?? [];
		current.push(command);
		existingCommandsByName.set(command.name, current);
	}

	const workflowsByAlias = new Map<string, WorkflowScopeCandidate[]>();
	for (const entry of finalEntries) {
		const current = workflowsByAlias.get(entry.definition.command.name) ?? [];
		current.push(entry);
		workflowsByAlias.set(entry.definition.command.name, current);
	}

	const workflows: WorkflowRegistryEntry[] = [];
	const workflowById = Object.create(null) as Record<string, WorkflowRegistryEntry>;
	const aliases = Object.create(null) as Record<string, string>;

	for (const entry of finalEntries) {
		const aliasName = entry.definition.command.name;
		const aliasGroup = workflowsByAlias.get(aliasName) ?? [];
		const existingCommandGroup = existingCommandsByName.get(aliasName) ?? [];
		let alias: WorkflowRegistryAlias;

		if (aliasGroup.length > 1) {
			const collidingWorkflowIds = aliasGroup
				.map((candidate) => candidate.definition.id)
				.sort((first, second) => first.localeCompare(second));
			alias = {
				name: aliasName,
				status: "workflow-collision",
				collidingWorkflowIds,
				collidingCommands: [],
			};
			addAliasDiagnostics(
				entry,
				aliasName,
				`Workflow command alias "/${aliasName}" is claimed by multiple workflows (${collidingWorkflowIds.join(", ")}); named alias disabled for all of them.`,
				diagnostics,
			);
		} else if (existingCommandGroup.length > 0) {
			const collidingCommands = existingCommandGroup.map((command) => ({ ...command }));
			const sourceNames = [...new Set(collidingCommands.map((command) => command.source))].sort((first, second) =>
				first.localeCompare(second)
			);
			alias = {
				name: aliasName,
				status: "command-collision",
				collidingWorkflowIds: [],
				collidingCommands,
			};
			addAliasDiagnostics(
				entry,
				aliasName,
				`Workflow command alias "/${aliasName}" collides with existing ${sourceNames.join(", ")} command${sourceNames.length === 1 ? "" : "s"}; named alias disabled.`,
				diagnostics,
			);
		} else {
			alias = {
				name: aliasName,
				status: "available",
				collidingWorkflowIds: [],
				collidingCommands: [],
			};
			aliases[aliasName] = entry.definition.id;
		}

		const registered: WorkflowRegistryEntry = {
			id: entry.definition.id,
			source: entry.source,
			packagePath: entry.definition.packagePath,
			manifestPath: entry.definition.manifestPath,
			skillPath: entry.definition.skillPath,
			definition: entry.definition,
			alias,
		};
		workflows.push(registered);
		workflowById[registered.id] = registered;
	}

	return freezeDeep({
		sources,
		workflows,
		workflowById,
		aliases,
		diagnostics,
	});
}
