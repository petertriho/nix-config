import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
	discoverWorkflowRegistry,
	type WorkflowRegistry,
	type WorkflowRegistryEntry,
	type WorkflowRegistryExistingCommand,
} from "./registry.ts";
import {
	abortWorkflowRun,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	startWorkflowRun,
	summarizeWorkflowRun,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import {
	chooseWorkflowStartup,
	type WorkflowStartupResult,
} from "./startup.ts";
import type {
	NormalizedWorkflowDefinition,
	WorkflowRoleModelSelection,
	WorkflowRunSnapshot,
} from "./types.ts";

const WORKFLOW_COMMANDS = ["list", "run", "status", "abort"] as const;
const WORKFLOW_COMMAND_DESCRIPTIONS = {
	list: "List discovered workflows and diagnostics",
	run: "Start a discovered workflow by ID",
	status: "Show the active persisted workflow run",
	abort: "Abort the active workflow run",
} satisfies Record<(typeof WORKFLOW_COMMANDS)[number], string>;
const DEFAULT_RESUME_REQUEST =
	"Resume the active workflow from its persisted state. Continue from the current stable gate, "
	+ "use the recorded workflow data and role sessions, and do not repeat completed work.";
const WORKFLOW_AGENT_SEARCH_DESCRIPTION =
	"the bundled agents, global ~/.pi/agent/agents/, and trusted project .pi/agents/";

type WorkflowCommandContext = ExtensionCommandContext;
type WorkflowSessionContext = ExtensionContext;

export interface WorkflowCommandStateStore {
	getState(): WorkflowRunState;
	commit(transition: WorkflowRunTransitionResult): void;
}

export interface WorkflowCommandRuntimeDependencies {
	readonly state: WorkflowCommandStateStore;
	readonly loadAgent: (agentName: string) => unknown | null;
	readonly isTmuxAvailable: () => boolean;
	readonly muxSetupHint: () => string;
	readonly renameTab?: (title: string) => void;
	readonly createRunId?: () => string;
	readonly chooseStartup?: (
		ctx: Parameters<typeof chooseWorkflowStartup>[0],
		definition: NormalizedWorkflowDefinition,
		projectRoot: string,
	) => Promise<WorkflowStartupResult>;
	readonly discoverRegistry?: (
		ctx: WorkflowSessionContext,
		existingCommands: readonly WorkflowRegistryExistingCommand[],
	) => WorkflowRegistry;
	readonly agentSearchDescription?: string;
}

export interface WorkflowAgentAvailability {
	readonly available: boolean;
	readonly requiredAgents: readonly string[];
	readonly missingAgents: readonly string[];
}

export interface WorkflowCommandRuntime {
	refreshRegistry(ctx: WorkflowSessionContext): WorkflowRegistry;
	getRegistry(): WorkflowRegistry | null;
	restoreActiveRunUx(ctx: WorkflowSessionContext): void;
	runWorkflow(
		workflowId: string,
		request: string,
		ctx: WorkflowCommandContext,
	): Promise<boolean>;
	resumeWorkflow(request: string, ctx: WorkflowCommandContext): boolean;
	listWorkflows(ctx: WorkflowCommandContext): string;
	showStatus(ctx: WorkflowCommandContext): string;
	abortActiveWorkflow(ctx: WorkflowCommandContext): boolean;
}

function formatSelection(selection: WorkflowRoleModelSelection): string {
	return `${selection.provider}/${selection.model}:${selection.thinking ?? "off"}`;
}

function escapeXmlAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("\"", "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function formatAssignments(snapshot: WorkflowRunSnapshot): string[] {
	if (snapshot.policy === "parent-per-role") {
		return [
			"- policy behavior: resolve the current parent model and thinking level when each fresh role launches",
		];
	}
	const assignments = snapshot.currentAssignments ?? snapshot.originalAssignments ?? {};
	return snapshot.definition.roles.map((role) => {
		const selection = assignments[role.id];
		return selection
			? `- ${role.id}: ${formatSelection(selection)}`
			: `- ${role.id}: unavailable`;
	});
}

function formatRoleDeclarations(definition: NormalizedWorkflowDefinition): string[] {
	return definition.roles.map((role) =>
		[
			`- id=${JSON.stringify(role.id)}`,
			`label=${JSON.stringify(role.label)}`,
			`agent=${JSON.stringify(role.agent)}`,
			`reads=${JSON.stringify(role.reads.join(","))}`,
			`writes=${JSON.stringify(role.writes.join(","))}`,
		].join(" ")
	);
}

function formatDataDeclarations(definition: NormalizedWorkflowDefinition): string[] {
	if (definition.dataOrder.length === 0) return ["- (none)"];
	const lines: string[] = [];
	for (const slotId of definition.dataOrder) {
		const slot = definition.data[slotId];
		if (!slot) continue;
		if (slot.kind === "string") {
			lines.push(
				`- id=${JSON.stringify(slot.id)} kind=string label=${JSON.stringify(slot.label)}`,
			);
			continue;
		}
		const constraint = slot.constraint
			? ` constraint=${JSON.stringify(JSON.stringify(slot.constraint))}`
			: "";
		lines.push(
			`- id=${JSON.stringify(slot.id)} kind=file label=${JSON.stringify(slot.label)}${constraint}`,
		);
	}
	return lines;
}

function formatCurrentData(snapshot: WorkflowRunSnapshot): string[] {
	const entries: string[] = [];
	for (const slotId of snapshot.definition.dataOrder) {
		const value = snapshot.data[slotId];
		if (value !== undefined) {
			entries.push(`- ${slotId}: ${JSON.stringify(value)}`);
		}
	}
	return entries.length > 0 ? entries : ["- (none yet)"];
}

function formatRoleSessions(snapshot: WorkflowRunSnapshot): string[] {
	const lines: string[] = [];
	for (const role of snapshot.definition.roles) {
		const session = snapshot.roleSessions[role.id];
		if (!session || (!session.current && session.history.length === 0)) continue;
		lines.push(
			`- ${role.id}: current=${JSON.stringify(session.current ?? "")} history=${JSON.stringify(session.history.join(","))}`,
		);
	}
	return lines.length > 0 ? lines : ["- (none yet)"];
}

function formatActiveLaunch(snapshot: WorkflowRunSnapshot): string[] {
	const activeLaunch = snapshot.activeLaunch;
	if (!activeLaunch) return [];
	const lines = [
		"",
		"Active launch:",
		`- roleId: ${JSON.stringify(activeLaunch.roleId)}`,
		`- status: ${JSON.stringify(activeLaunch.status)}`,
		`- sessionPath: ${JSON.stringify(activeLaunch.sessionPath ?? "")}`,
	];
	if (activeLaunch.status === "interrupted") {
		lines.push(
			"- warning: the parent watcher was not reattached; review detached repository changes before resuming or spawning fresh",
		);
	}
	return lines;
}

/**
 * Render a private workflow package skill as a structured skill invocation.
 *
 * The skill body comes from the immutable run snapshot, not the live registry,
 * so a reload or package edit cannot change an active run's orchestration
 * contract. The caller-provided request is the final bytes in the message.
 */
export function buildWorkflowSkillMessage(
	snapshot: WorkflowRunSnapshot,
	request: string,
	options: { resume?: boolean } = {},
): string {
	const definition = snapshot.definition;
	const mode = options.resume ? "resume" : "start";
	const config = [
		`<workflow-config version="1" mode="${mode}">`,
		"Workflow:",
		`- id: ${JSON.stringify(snapshot.workflowId)}`,
		`- runId: ${JSON.stringify(snapshot.runId)}`,
		`- source: ${JSON.stringify(snapshot.source)}`,
		`- packagePath: ${JSON.stringify(snapshot.packagePath)}`,
		`- manifestHash: ${JSON.stringify(snapshot.manifestHash)}`,
		`- skillHash: ${JSON.stringify(snapshot.skillHash)}`,
		`- modelPolicy: ${JSON.stringify(snapshot.policy)}`,
		`- assignmentSource: ${JSON.stringify(snapshot.assignmentSource)}`,
		"",
		"Current role assignments:",
		...formatAssignments(snapshot),
		"",
		"Manifest roles (use these exact role IDs):",
		...formatRoleDeclarations(definition),
		"",
		"Typed workflow data declarations:",
		...formatDataDeclarations(definition),
		"",
		"Current workflow data:",
		...formatCurrentData(snapshot),
		"",
		"Current role sessions:",
		...formatRoleSessions(snapshot),
		...formatActiveLaunch(snapshot),
		"",
		"Dedicated workflow lifecycle tools:",
		`- workflow_spawn: pass runId=${JSON.stringify(snapshot.runId)}, an explicit manifest role ID, a task, and optional typed data updates`,
		`- workflow_resume: pass runId=${JSON.stringify(snapshot.runId)} and an explicit role ID; the runtime resolves the current session`,
		`- workflow_recover: pass runId=${JSON.stringify(snapshot.runId)}, an explicit role ID, and eligible provider failure text`,
		`- workflow_complete: MUST be called exactly once with runId=${JSON.stringify(snapshot.runId)} and status completed or aborted at every terminal outcome`,
		"- These tools are fire-and-forget. Never poll, sleep, tail session files, or call status tools to wait for role completion.",
		"- Never use ordinary subagent or subagent_resume for manifest workflow roles.",
		"</workflow-config>",
	].join("\n");

	const skillName = escapeXmlAttribute(definition.skill.frontmatter.name);
	const skillPath = escapeXmlAttribute(definition.skillPath);
	return [
		`<skill name="${skillName}" location="${skillPath}">`,
		definition.skill.body,
		"</skill>",
		"",
		config,
		"",
		"Skill input:",
		request,
	].join("\n");
}

export function validateWorkflowAgents(
	entry: Pick<WorkflowRegistryEntry, "definition">,
	loadAgent: (agentName: string) => unknown | null,
): WorkflowAgentAvailability {
	const requiredAgents = [...new Set(entry.definition.roles.map((role) => role.agent))]
		.sort((first, second) => first.localeCompare(second));
	const missingAgents = requiredAgents.filter((agentName) => !loadAgent(agentName));
	return {
		available: missingAgents.length === 0,
		requiredAgents,
		missingAgents,
	};
}

function aliasAvailability(entry: WorkflowRegistryEntry): string {
	if (entry.alias.status === "available") return `/${entry.alias.name}`;
	if (entry.alias.status === "workflow-collision") {
		return `disabled (claimed by ${entry.alias.collidingWorkflowIds.join(", ")})`;
	}
	const sources = [...new Set(entry.alias.collidingCommands.map((command) => command.source))]
		.sort((first, second) => first.localeCompare(second));
	return `disabled (collides with ${sources.join(", ") || "an existing command"})`;
}

export function formatWorkflowRegistryList(
	registry: WorkflowRegistry,
	loadAgent: (agentName: string) => unknown | null,
): string {
	const lines = [
		`Workflows (${registry.workflows.length} valid):`,
	];
	if (registry.workflows.length === 0) lines.push("- (none)");
	for (const entry of registry.workflows) {
		const agents = validateWorkflowAgents(entry, loadAgent);
		const availability = agents.available
			? `available (${agents.requiredAgents.join(", ") || "no agents"})`
			: `unavailable (missing agents: ${agents.missingAgents.join(", ")})`;
		lines.push(
			`- ${entry.id}: alias ${aliasAvailability(entry)}; source ${entry.source}; ${availability}`,
			`  package: ${entry.packagePath}`,
		);
	}
	if (registry.diagnostics.length > 0) {
		lines.push("", `Diagnostics (${registry.diagnostics.length}):`);
		for (const diagnostic of registry.diagnostics) {
			const workflow = diagnostic.workflowId ? ` workflow=${diagnostic.workflowId}` : "";
			const alias = diagnostic.alias ? ` alias=/${diagnostic.alias}` : "";
			lines.push(
				`- [${diagnostic.kind}/${diagnostic.source}${workflow}${alias}] ${diagnostic.path}: ${diagnostic.message}`,
			);
		}
	}
	return lines.join("\n");
}

export function formatWorkflowRunStatus(snapshot: WorkflowRunSnapshot | null): string {
	if (!snapshot) {
		return [
			"No active workflow run.",
			"Start one with /workflow run <id> <request> or a listed workflow alias.",
		].join("\n");
	}
	const summary = summarizeWorkflowRun(snapshot);
	const lines = [
		`Workflow ${snapshot.workflowId} is ${snapshot.status}.`,
		`Run ID: ${snapshot.runId}`,
		`Source: ${snapshot.source}`,
		`Package: ${snapshot.packagePath}`,
		`Project: ${snapshot.projectRoot}`,
		`Model policy: ${snapshot.policy} (${snapshot.assignmentSource})`,
		`Started: ${snapshot.startedAt}`,
		`Updated: ${snapshot.updatedAt}`,
	];
	if (summary.activeLaunch) {
		lines.push(
			`Active launch: ${summary.activeLaunch.roleLabel ?? summary.activeLaunch.roleId} `
			+ `(${summary.activeLaunch.roleId}) — ${summary.activeLaunch.status}`,
		);
		if (summary.activeLaunch.sessionPath) {
			lines.push(`Active launch session: ${summary.activeLaunch.sessionPath}`);
		}
	}
	if (summary.interrupted) {
		lines.push(
			"WARNING: This launch was interrupted by reload or shutdown. Its live watcher was not reattached.",
			"Review detached repository changes manually before workflow_resume or a fresh workflow_spawn.",
		);
	}
	const sessionEntries = Object.entries(summary.currentRoleSessions);
	lines.push("Current role sessions:");
	if (sessionEntries.length === 0) {
		lines.push("- (none)");
	} else {
		for (const [roleId, sessionPath] of sessionEntries) {
			const roleLabel = snapshot.definition.roleById[roleId]?.label ?? roleId;
			lines.push(`- ${roleLabel} (${roleId}): ${sessionPath}`);
		}
	}
	lines.push(
		"Resume orchestration with /workflow-resume [latest instruction].",
		"Abort the run manually with /workflow abort.",
	);
	return lines.join("\n");
}

function existingCommandsForRegistry(
	commands: readonly SlashCommandInfo[],
	registeredAliases: ReadonlySet<string>,
): WorkflowRegistryExistingCommand[] {
	// Pi suffixes every extension command in a duplicate-name group
	// (for example, docs:1 and docs:2). Ignore exactly one command owned by
	// this runtime and normalize the remaining owners back to the manifest
	// alias so a command registered after startup still disables that alias.
	const aliasCommandGroups = new Map<
		string,
		{ direct: number[]; suffixed: number[] }
	>();
	for (const [index, command] of commands.entries()) {
		if (command.source !== "extension") continue;
		let aliasName: string | undefined;
		let suffixed = false;
		if (registeredAliases.has(command.name)) {
			aliasName = command.name;
		} else {
			const separator = command.name.lastIndexOf(":");
			const candidate = separator > 0
				? command.name.slice(0, separator)
				: "";
			const suffix = separator > 0
				? command.name.slice(separator + 1)
				: "";
			if (
				registeredAliases.has(candidate)
				&& /^[1-9]\d*$/.test(suffix)
			) {
				aliasName = candidate;
				suffixed = true;
			}
		}
		if (!aliasName) continue;
		const group = aliasCommandGroups.get(aliasName) ?? {
			direct: [],
			suffixed: [],
		};
		group[suffixed ? "suffixed" : "direct"].push(index);
		aliasCommandGroups.set(aliasName, group);
	}

	const generatedCommandIndices = new Set<number>();
	const normalizedCommandNames = new Map<number, string>();
	for (const [aliasName, group] of aliasCommandGroups) {
		const generatedIndex = group.direct[0]
			?? (group.suffixed.length > 1 ? group.suffixed[0] : undefined);
		if (generatedIndex === undefined) continue;
		generatedCommandIndices.add(generatedIndex);
		if (group.direct.length === 0) {
			for (const index of group.suffixed) {
				if (index !== generatedIndex) {
					normalizedCommandNames.set(index, aliasName);
				}
			}
		}
	}

	const existing: WorkflowRegistryExistingCommand[] = [];
	for (const [index, command] of commands.entries()) {
		if (generatedCommandIndices.has(index)) continue;
		const item: WorkflowRegistryExistingCommand = {
			name: normalizedCommandNames.get(index) ?? command.name,
			source: command.source,
		};
		if (command.description) {
			Object.assign(item, { description: command.description });
		}
		existing.push(item);
	}
	return existing;
}

function defaultDiscoverRegistry(
	ctx: WorkflowSessionContext,
	existingCommands: readonly WorkflowRegistryExistingCommand[],
): WorkflowRegistry {
	return discoverWorkflowRegistry({
		projectRoot: ctx.cwd,
		projectTrusted: ctx.isProjectTrusted(),
		existingCommands,
	});
}

function workflowUsage(entry?: WorkflowRegistryEntry): string {
	if (!entry) {
		return "Usage: /workflow list | run <id> <request> | status | abort";
	}
	const hint = entry.definition.command.argumentHint ?? "<request>";
	return `Usage: /${entry.definition.command.name} ${hint}`;
}

function formatTabRequest(request: string): string {
	const compact = request.replace(/\s+/g, " ").trim();
	if (compact.length <= 40) return compact;
	return `${compact.slice(0, 40)}…`;
}

function notify(ctx: WorkflowSessionContext, message: string, level: "info" | "warning" | "error"): void {
	ctx.ui.notify(message, level);
}

function parseWorkflowCommand(args: string):
	| { action: "list" | "status" | "abort" }
	| { action: "run"; workflowId: string; request: string }
	| { action: "invalid" } {
	const trimmed = args.trim();
	if (!trimmed) return { action: "invalid" };
	if (trimmed === "list") return { action: "list" };
	if (trimmed === "status") return { action: "status" };
	if (trimmed === "abort") return { action: "abort" };
	const runMatch = args.match(/^\s*run\s+([^\s]+)\s+([\s\S]+)$/);
	if (!runMatch || !runMatch[2].trim()) return { action: "invalid" };
	return {
		action: "run",
		workflowId: runMatch[1],
		request: runMatch[2],
	};
}

export function workflowArgumentCompletions(
	prefix: string,
	workflows: readonly Pick<WorkflowRegistryEntry, "id" | "definition">[] = [],
): AutocompleteItem[] | null {
	const runMatch = prefix.match(/^\s*run\s+([^\s]*)$/);
	if (runMatch) {
		const workflowPrefix = runMatch[1];
		const items: AutocompleteItem[] = [];
		for (const workflow of workflows) {
			if (!workflow.id.startsWith(workflowPrefix)) continue;
			items.push({
				value: `run ${workflow.id} `,
				label: workflow.id,
				description: workflow.definition.command.description,
			});
		}
		return items.length > 0 ? items : null;
	}
	const normalized = prefix.trimStart();
	if (!normalized.includes(" ")) {
		const items: AutocompleteItem[] = [];
		for (const command of WORKFLOW_COMMANDS) {
			if (!command.startsWith(normalized)) continue;
			items.push({
				value: command === "run" ? "run " : command,
				label: command,
				description: WORKFLOW_COMMAND_DESCRIPTIONS[command],
			});
		}
		return items.length > 0 ? items : null;
	}
	return null;
}

type StartedWorkflowStartupResult = Extract<
	WorkflowStartupResult,
	{ status: "started" }
>;

class DefaultWorkflowCommandRuntime implements WorkflowCommandRuntime {
	private registry: WorkflowRegistry | null = null;
	private readonly registeredAliases = new Set<string>();
	private readonly pi: ExtensionAPI;
	private readonly deps: WorkflowCommandRuntimeDependencies;
	private readonly chooseStartup: NonNullable<
		WorkflowCommandRuntimeDependencies["chooseStartup"]
	>;
	private readonly discoverRegistry: NonNullable<
		WorkflowCommandRuntimeDependencies["discoverRegistry"]
	>;
	private readonly createRunId: () => string;
	private readonly agentSearchDescription: string;

	constructor(pi: ExtensionAPI, deps: WorkflowCommandRuntimeDependencies) {
		this.pi = pi;
		this.deps = deps;
		this.chooseStartup = deps.chooseStartup ?? chooseWorkflowStartup;
		this.discoverRegistry = deps.discoverRegistry ?? defaultDiscoverRegistry;
		this.createRunId = deps.createRunId ?? (() => `workflow-${randomUUID()}`);
		this.agentSearchDescription =
			deps.agentSearchDescription ?? WORKFLOW_AGENT_SEARCH_DESCRIPTION;
	}

	refreshRegistry(ctx: WorkflowSessionContext): WorkflowRegistry {
		const existingCommands = existingCommandsForRegistry(
			this.pi.getCommands(),
			this.registeredAliases,
		);
		this.registry = this.discoverRegistry(ctx, existingCommands);
		for (const aliasName of Object.keys(this.registry.aliases)) {
			this.registerAlias(aliasName);
		}
		return this.registry;
	}

	getRegistry(): WorkflowRegistry | null {
		return this.registry;
	}

	restoreActiveRunUx(ctx: WorkflowSessionContext): void {
		const active = getActiveWorkflowRun(this.deps.state.getState());
		if (!active) return;
		try {
			this.deps.renameTab?.(` Workflow: ${active.workflowId}`);
		} catch {
			// Cosmetic tab naming must never block restored workflow state.
		}
		const summary = summarizeWorkflowRun(active);
		if (summary.interrupted) {
			const session = summary.activeLaunch?.sessionPath
				? ` Session: ${summary.activeLaunch.sessionPath}.`
				: "";
			notify(
				ctx,
				`Restored workflow "${active.workflowId}" (${active.runId}) with an interrupted `
				+ `${summary.activeLaunch?.roleLabel ?? summary.activeLaunch?.roleId ?? "role"} launch.`
				+ `${session} Run /workflow status, then /workflow-resume when ready.`,
				"warning",
			);
			return;
		}
		notify(
			ctx,
			`Restored active workflow "${active.workflowId}" (${active.runId}). `
			+ "Run /workflow status or /workflow-resume.",
			"info",
		);
	}

	async runWorkflow(
		workflowId: string,
		request: string,
		ctx: WorkflowCommandContext,
	): Promise<boolean> {
		const currentRegistry = this.registry ?? this.refreshRegistry(ctx);
		const entry = this.resolveRunnableEntry(
			currentRegistry,
			workflowId,
			request,
			ctx,
		);
		if (!entry) return false;

		const replaceActive = await this.confirmReplacement(entry, ctx);
		if (replaceActive === null) return false;

		const startup = await this.selectStartup(entry, ctx);
		if (!startup) return false;

		const runId = this.createRunId();
		const started = this.persistStartedRun({
			entry,
			startup,
			runId,
			replaceActive,
			ctx,
		});
		if (!started) return false;

		try {
			this.deps.renameTab?.(` Workflow: ${formatTabRequest(request)}`);
		} catch {
			// Cosmetic. Workflow skills may rename the tab again per role.
		}
		return this.deliverStartPrompt(entry, started, request, ctx);
	}

	resumeWorkflow(request: string, ctx: WorkflowCommandContext): boolean {
		const active = getActiveWorkflowRun(this.deps.state.getState());
		if (!active) {
			notify(ctx, "No active workflow run to resume.", "warning");
			return false;
		}
		if (!ctx.isIdle()) {
			notify(
				ctx,
				`Workflow "${active.workflowId}" cannot resume orchestration while the parent agent is busy.`,
				"warning",
			);
			return false;
		}
		const instruction = request.trim() ? request : DEFAULT_RESUME_REQUEST;
		try {
			this.deps.renameTab?.(` Workflow: ${active.workflowId}`);
		} catch {
			// Cosmetic only.
		}
		try {
			this.pi.sendUserMessage(
				buildWorkflowSkillMessage(active, instruction, { resume: true }),
			);
			return true;
		} catch (error) {
			notify(
				ctx,
				`Workflow "${active.workflowId}" could not deliver its resume prompt: `
				+ `${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			return false;
		}
	}

	listWorkflows(ctx: WorkflowCommandContext): string {
		const currentRegistry = this.registry ?? this.refreshRegistry(ctx);
		const text = formatWorkflowRegistryList(
			currentRegistry,
			this.deps.loadAgent,
		);
		const level = currentRegistry.diagnostics.length > 0 ? "warning" : "info";
		notify(ctx, text, level);
		return text;
	}

	showStatus(ctx: WorkflowCommandContext): string {
		const active = getActiveWorkflowRun(this.deps.state.getState());
		const text = formatWorkflowRunStatus(active);
		const level = active?.activeLaunch?.status === "interrupted"
			? "warning"
			: "info";
		notify(ctx, text, level);
		return text;
	}

	abortActiveWorkflow(ctx: WorkflowCommandContext): boolean {
		const active = getActiveWorkflowRun(this.deps.state.getState());
		if (!active) {
			notify(ctx, "No active workflow run to abort.", "warning");
			return false;
		}
		try {
			this.deps.state.commit(
				abortWorkflowRun(this.deps.state.getState(), active.runId),
			);
			notify(
				ctx,
				`Workflow "${active.workflowId}" (${active.runId}) aborted. `
				+ "Persisted data and role-session history remain available for audit.",
				"info",
			);
			return true;
		} catch (error) {
			notify(
				ctx,
				`Workflow "${active.workflowId}" could not be aborted: `
				+ `${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			return false;
		}
	}

	private registerAlias(aliasName: string): void {
		if (this.registeredAliases.has(aliasName)) return;
		const workflowId = this.registry?.aliases[aliasName];
		if (!workflowId) return;
		const entry = this.registry?.workflowById[workflowId];
		if (!entry) return;
		const hint = entry.definition.command.argumentHint;
		this.pi.registerCommand(aliasName, {
			description: hint
				? `${hint} — ${entry.definition.command.description}`
				: entry.definition.command.description,
			handler: async (args, commandCtx) => {
				const currentWorkflowId = this.registry?.aliases[aliasName];
				const currentEntry = currentWorkflowId
					? this.registry?.workflowById[currentWorkflowId]
					: undefined;
				if (!currentWorkflowId || !currentEntry) {
					notify(
						commandCtx,
						`Workflow alias "/${aliasName}" is no longer available. Use /workflow list and /workflow run <id> <request>.`,
						"error",
					);
					return;
				}
				if (!args.trim()) {
					notify(commandCtx, workflowUsage(currentEntry), "warning");
					return;
				}
				await this.runWorkflow(currentWorkflowId, args, commandCtx);
			},
		});
		this.registeredAliases.add(aliasName);
	}

	private resolveRunnableEntry(
		registry: WorkflowRegistry,
		workflowId: string,
		request: string,
		ctx: WorkflowCommandContext,
	): WorkflowRegistryEntry | null {
		const entry = registry.workflowById[workflowId];
		if (!entry) {
			notify(
				ctx,
				`Workflow "${workflowId}" is not available. Run /workflow list to inspect valid packages and diagnostics.`,
				"error",
			);
			return null;
		}
		if (!request.trim()) {
			notify(ctx, workflowUsage(entry), "warning");
			return null;
		}
		if (!ctx.isIdle()) {
			notify(
				ctx,
				`Workflow "${entry.id}" cannot start while the parent agent is busy. Try again when it is idle.`,
				"warning",
			);
			return null;
		}
		const agents = validateWorkflowAgents(entry, this.deps.loadAgent);
		if (!agents.available) {
			notify(
				ctx,
				`Workflow "${entry.id}" cannot start. Missing required agents: `
				+ `${agents.missingAgents.join(", ")}. Checked ${this.agentSearchDescription}.`,
				"error",
			);
			return null;
		}
		if (!this.deps.isTmuxAvailable()) {
			notify(
				ctx,
				`Workflow "${entry.id}" needs tmux. ${this.deps.muxSetupHint()}`,
				"error",
			);
			return null;
		}
		if (!ctx.sessionManager.getSessionFile()) {
			notify(
				ctx,
				`Workflow "${entry.id}" needs a persistent parent session so its run state can be restored.`,
				"error",
			);
			return null;
		}
		if (!ctx.hasUI) {
			notify(
				ctx,
				`Workflow "${entry.id}" needs interactive UI for model setup and replacement gates.`,
				"error",
			);
			return null;
		}
		return entry;
	}

	private async confirmReplacement(
		entry: WorkflowRegistryEntry,
		ctx: WorkflowCommandContext,
	): Promise<boolean | null> {
		const active = getActiveWorkflowRun(this.deps.state.getState());
		if (!active) return false;
		const replaceActive = await ctx.ui.confirm(
			"Replace active workflow?",
			`Workflow "${active.workflowId}" (${active.runId}) is still active. `
			+ `Abort it and start "${entry.id}" instead?`,
		);
		if (replaceActive) return true;
		notify(
			ctx,
			`Kept active workflow "${active.workflowId}" (${active.runId}).`,
			"info",
		);
		return null;
	}

	private async selectStartup(
		entry: WorkflowRegistryEntry,
		ctx: WorkflowCommandContext,
	): Promise<StartedWorkflowStartupResult | null> {
		let startup: WorkflowStartupResult;
		try {
			startup = await this.chooseStartup(ctx, entry.definition, ctx.cwd);
		} catch (error) {
			notify(
				ctx,
				`Workflow "${entry.id}" model setup failed: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			return null;
		}
		if (startup.status === "started") return startup;
		const reason = startup.reason === "user"
			? `Workflow "${entry.id}" startup cancelled.`
			: `Workflow "${entry.id}" did not start: ${startup.reason}`;
		notify(ctx, reason, "warning");
		return null;
	}

	private persistStartedRun(options: {
		entry: WorkflowRegistryEntry;
		startup: StartedWorkflowStartupResult;
		runId: string;
		replaceActive: boolean;
		ctx: WorkflowCommandContext;
	}): WorkflowRunSnapshot | null {
		const { entry, startup, runId, replaceActive, ctx } = options;
		try {
			const startInput: Parameters<typeof startWorkflowRun>[1] = {
				runId,
				source: entry.source,
				definition: entry.definition,
				projectRoot: startup.state.projectRoot,
				policy: startup.state.policy,
				assignmentSource: startup.state.assignmentSource,
			};
			if (startup.state.originalAssignments) {
				Object.assign(startInput, {
					originalAssignments: startup.state.originalAssignments,
				});
			}
			if (startup.state.currentAssignments) {
				Object.assign(startInput, {
					currentAssignments: startup.state.currentAssignments,
				});
			}
			this.deps.state.commit(
				startWorkflowRun(
					this.deps.state.getState(),
					startInput,
					{ replaceActive },
				),
			);
		} catch (error) {
			notify(
				ctx,
				`Workflow "${entry.id}" run persistence failed: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			return null;
		}
		const started = getWorkflowRunSnapshot(this.deps.state.getState(), runId);
		if (started?.status === "active") return started;
		notify(
			ctx,
			`Workflow "${entry.id}" did not produce an active persisted run.`,
			"error",
		);
		return null;
	}

	private deliverStartPrompt(
		entry: WorkflowRegistryEntry,
		started: WorkflowRunSnapshot,
		request: string,
		ctx: WorkflowCommandContext,
	): boolean {
		try {
			this.pi.sendUserMessage(buildWorkflowSkillMessage(started, request));
			return true;
		} catch (error) {
			try {
				this.deps.state.commit(
					abortWorkflowRun(this.deps.state.getState(), started.runId),
				);
			} catch {
				// The original send error is more actionable; persistence
				// already contains the start snapshot for audit.
			}
			notify(
				ctx,
				`Workflow "${entry.id}" could not deliver its private skill prompt: `
				+ `${error instanceof Error ? error.message : String(error)}. The new run was aborted.`,
				"error",
			);
			return false;
		}
	}
}

export function createWorkflowCommandRuntime(
	pi: ExtensionAPI,
	deps: WorkflowCommandRuntimeDependencies,
): WorkflowCommandRuntime {
	return new DefaultWorkflowCommandRuntime(pi, deps);
}

export function registerWorkflowCommands(
	pi: ExtensionAPI,
	deps: WorkflowCommandRuntimeDependencies,
): WorkflowCommandRuntime {
	const runtime = createWorkflowCommandRuntime(pi, deps);

	pi.registerCommand("workflows", {
		description: "List discovered workflow packages, aliases, availability, and diagnostics",
		handler: async (_args, ctx) => {
			runtime.listWorkflows(ctx);
		},
	});

	pi.registerCommand("workflow", {
		description: "Manage workflows: list | run <id> <request> | status | abort",
		getArgumentCompletions: (prefix) =>
			workflowArgumentCompletions(
				prefix,
				runtime.getRegistry()?.workflows ?? [],
			),
		handler: async (args, ctx) => {
			const parsed = parseWorkflowCommand(args);
			if (parsed.action === "list") {
				runtime.listWorkflows(ctx);
				return;
			}
			if (parsed.action === "status") {
				runtime.showStatus(ctx);
				return;
			}
			if (parsed.action === "abort") {
				runtime.abortActiveWorkflow(ctx);
				return;
			}
			if (parsed.action === "run") {
				await runtime.runWorkflow(parsed.workflowId, parsed.request, ctx);
				return;
			}
			notify(ctx, workflowUsage(), "warning");
		},
	});

	pi.registerCommand("workflow-resume", {
		description: "Resume the active persisted workflow orchestration at its current stable gate",
		handler: async (args, ctx) => {
			runtime.resumeWorkflow(args, ctx);
		},
	});

	return runtime;
}
