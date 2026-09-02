import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	getSubagentActivityFile,
	type SubagentActivityState,
} from "./activity.ts";
import {
	buildRolloverHandoff,
	calculateContextFit,
	chooseResumeGateAction,
	estimateSavedSessionContext,
	linkRolloverLineage,
	toContextEstimateRecord,
	type ContextFit,
	type SavedContextEstimate,
} from "./context-fit.ts";
import {
	type LaunchProfile,
	type LaunchProfileResources,
	type LaunchProfileWorkflowMetadata,
	type ModelSelection,
	type PrimarySkillIdentity,
	type ProviderFailureRecord,
	THINKING_LEVELS,
	fingerprintStrings,
	hashText,
	normalizeLaunchProfileWorkflowMetadata,
	readLaunchProfile,
	removeLaunchProfile,
	updateLaunchProfile,
	updateProfileAfterSuccessfulResponse,
	writeLaunchProfile,
} from "./launch-profile.ts";
import {
	resolveModelPolicy,
	type ResolvedModelSelection,
} from "./model-picker.ts";
import {
	diffResourceFingerprints,
	primarySkillChanged,
	resolveResumeRestoration,
	resourceChangeNotice,
} from "./resume-restore.ts";
import { findLastAssistantMessage, getNewEntries, seedSubagentSessionFile } from "./session.ts";
import { createStatusState, type SubagentStatusState } from "./status.ts";
import { shellEscape } from "./tmux.ts";
import {
	formatUsageSummary,
	summarizeSubagentUsage,
	type SubagentUsageSummary,
	withContextWindow,
} from "./usage.ts";
import { classifyProviderFailure } from "./workflow/recovery.ts";

export interface LaunchContext {
	pi?: ExtensionAPI;
	sessionManager: {
		getSessionFile(): string | undefined | null;
		getSessionId(): string;
		getSessionDir(): string;
	};
	cwd: string;
	model: ExtensionContext["model"];
	thinkingLevel?: ExtensionContext["thinkingLevel"];
	modelRegistry?: ExtensionContext["modelRegistry"];
	scopedModels?: ExtensionContext["scopedModels"];
	hasUI?: ExtensionContext["hasUI"];
	ui?: ExtensionContext["ui"];
}

export interface LaunchProfileInput {
	displayName: string;
	agentName?: string;
	roleBody: string;
	systemPromptMode: "append" | "replace" | "message";
	cwd: string;
	agentDir: string;
	controls: {
		spawning?: boolean;
		denyTools: string[];
		autoExit?: boolean;
		interactive: boolean;
		sessionMode: "standalone" | "lineage-only" | "fork";
	};
	effectiveSkills?: string;
	modelArgument?: string;
	originalSessionPath: string;
	resources: LaunchProfileResources;
	workflow?: LaunchProfileWorkflowMetadata;
}

export interface SubagentToolResult {
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
}

export interface PhaseBoundaryOutcome {
	details: Record<string, unknown>;
	violationText?: string;
}

export interface SubagentResult {
	name: string;
	task: string;
	summary: string;
	sessionFile?: string;
	claudeSessionId?: string;
	exitCode: number;
	elapsed: number;
	error?: string;
	errorMessage?: string;
	turnLimit?: boolean;
	usage?: SubagentUsageSummary;
	responded?: boolean;
	ping?: { name: string; message: string };
}

export interface RunningSubagent {
	id: string;
	name: string;
	task: string;
	agent?: string;
	surface: string;
	startTime: number;
	sessionFile: string;
	launchScriptFile?: string;
	activityFile?: string;
	activity?: SubagentActivityState;
	activityRead?: {
		ok: boolean;
		reason?: "missing" | "invalid" | "wrong-id";
		error?: string;
	};
	abortController?: AbortController;
	cli?: string;
	sentinelFile?: string;
	statusState: SubagentStatusState;
	interactive: boolean;
	/**
	 * Opaque repository boundary captured by a caller. The shared execution
	 * service never interprets it; the injected describeBoundary hook does.
	 */
	boundary?: unknown;
}

export interface SubagentLaunchParams {
	name: string;
	task: string;
	agent?: string;
	systemPrompt?: string;
	model?: string;
	skills?: string;
	tools?: string;
	cwd?: string;
	fork?: boolean;
	interactive?: boolean;
	resumeSessionId?: string;
}

export interface AgentDefaultsLike {
	model?: string;
	tools?: string;
	skills?: string;
	thinking?: string;
	denyTools?: string;
	spawning?: boolean;
	autoExit?: boolean;
	interactive?: boolean;
	systemPromptMode?: "append" | "replace";
	sessionMode?: "standalone" | "lineage-only" | "fork";
	cwd?: string;
	cli?: string;
	body?: string;
	disableModelInvocation?: boolean;
}

export interface SubagentPathResolution {
	effectiveCwd: string | null;
	localAgentDir: string | null;
	effectiveAgentDir: string;
}

export interface LaunchBehavior {
	sessionMode: "standalone" | "lineage-only" | "fork";
	seededSessionMode: "lineage-only" | "fork" | null;
	inheritsConversationContext: boolean;
	taskDelivery: "direct" | "artifact";
}

export interface PiParentSelection {
	model?: Pick<NonNullable<ExtensionContext["model"]>, "provider" | "id">;
	thinkingLevel?: ExtensionContext["thinkingLevel"];
}

export interface SubagentResumeParams {
	sessionPath: string;
	name?: string;
	message?: string;
	autoExit?: boolean;
	model?: string;
}

export interface ResumeRecoveryContext {
	failure: ProviderFailureRecord;
	details?: Record<string, unknown>;
	pickerTitle?: string;
	pickerSubject?: string;
	transformWorkflowMetadata?: (
		workflow: LaunchProfileWorkflowMetadata,
		selection: ResolvedModelSelection,
	) => LaunchProfileWorkflowMetadata;
	onSuccessfulResponse?: (selection: ModelSelection) => void | Promise<void>;
}

export interface ResumeLifecycleContext {
	/** Details merged into acknowledgements and asynchronous result messages. */
	details?: Record<string, unknown>;
	/** Authoritative workflow sidecar metadata for this resume/rollover. */
	workflowMetadata?: LaunchProfileWorkflowMetadata;
	/** Caller-captured repository boundary for this role execution. */
	boundary?: unknown;
	/** Exact fresh-rollover prompt when the caller owns manifest handoff text. */
	rolloverMessage?: string;
	onLaunched?: (input: {
		running: RunningSubagent;
		replacement: boolean;
		originalSessionPath: string;
		sessionPath: string;
	}) => void | Promise<void>;
	onResult?: (input: {
		result: SubagentResult;
		boundary?: PhaseBoundaryOutcome;
		replacement: boolean;
		originalSessionPath: string;
		sessionPath: string;
	}) => void | Promise<void>;
	onError?: (input: {
		message: string;
		replacement: boolean;
		originalSessionPath: string;
		sessionPath: string;
	}) => void | Promise<void>;
}

export interface TaskRuntimeOptions {
	maxTurns?: number;
}

export interface BackgroundWatchOptions {
	pi: ExtensionAPI;
	ctx: LaunchContext;
	running: RunningSubagent;
	pingAgent?: string;
	pingSessionPath?: string;
	onPing?: (
		input: { result: SubagentResult; boundary?: PhaseBoundaryOutcome },
	) => Promise<void> | void;
	onSuccess: (
		input: { result: SubagentResult; boundary?: PhaseBoundaryOutcome },
	) => Promise<{ content: string; details: Record<string, unknown> }>
		| { content: string; details: Record<string, unknown> };
	onError: (message: string) => Promise<{ content: string; details: Record<string, unknown> }>
		| { content: string; details: Record<string, unknown> };
}

export interface SubagentServiceDependencies {
	subagentsDir: string;
	getAgentConfigDir(): string;
	normalizeSubagentParams(params: SubagentLaunchParams): SubagentLaunchParams;
	loadAgentDefaults(agentName: string): AgentDefaultsLike | null;
	resolveSubagentPaths(
		params: SubagentLaunchParams,
		agentDefs: AgentDefaultsLike | null,
	): SubagentPathResolution;
	resolveLaunchBehavior(
		params: SubagentLaunchParams,
		agentDefs: AgentDefaultsLike | null,
	): LaunchBehavior;
	resolveEffectiveInteractive(
		params: SubagentLaunchParams,
		agentDefs: AgentDefaultsLike | null,
	): boolean;
	resolvePiModelArgument(
		params: SubagentLaunchParams,
		agentDefs: Pick<AgentDefaultsLike, "model" | "thinking"> | null,
		parentSelection: PiParentSelection,
	): string | undefined;
	resolveDenyTools(agentDefs: AgentDefaultsLike | null): Set<string>;
	runningSubagents: Map<string, RunningSubagent>;
	observeRunningSubagent(running: RunningSubagent, observedAt?: number): void;
	startWidgetRefresh(): void;
	startStatusRefresh(pi: ExtensionAPI): void;
	updateWidget(): void;
	isTmuxAvailable(): boolean;
	muxUnavailableResult(): SubagentToolResult;
	createSurface(name: string): string;
	sendLongCommand(
		surface: string,
		command: string,
		options?: { scriptPath?: string; scriptPreamble?: string },
	): void;
	closeSurface(surface: string): void;
	pollForExit(
		surface: string,
		signal: AbortSignal,
		options: {
			interval: number;
			sessionFile?: string;
			sentinelFile?: string;
			onTick?: () => void;
		},
	): Promise<{
		exitCode: number;
		ping?: { name: string; message: string };
		reason?: string;
		errorMessage?: string;
	}>;
	readScreen(surface: string, lines: number): string;
	getModuleAbortSignal(): AbortSignal;
	describeBoundary?(
		running: Pick<RunningSubagent, "boundary">,
	): PhaseBoundaryOutcome | undefined;
	captureResumeBoundary?(
		profile: LaunchProfile | null,
		ctx: LaunchContext,
	): unknown;
	onRolloverLaunched?(input: {
		running: RunningSubagent;
		rolloverProfile: LaunchProfile;
		params: SubagentResumeParams;
		recovery?: ResumeRecoveryContext;
	}): void | Promise<void>;
}

const SUBAGENT_CONTROL_TOOLS = ["caller_ping", "subagent_done"] as const;
const CLAUDE_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions", "claude-code");

export function formatElapsed(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function getShellReadyDelayMs(): number {
	const raw = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS?.trim();
	const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
}

function getArtifactDir(sessionDir: string, sessionId: string): string {
	return join(sessionDir, "artifacts", sessionId);
}

function toSafeFileName(name: string, fallback: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || fallback
	);
}

function fileTimestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function buildSubagentToolAllowlist(effectiveTools?: string): string | null {
	const requested = (effectiveTools ?? "")
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);

	if (requested.length === 0) return null;

	const allow = new Set(requested);
	for (const tool of SUBAGENT_CONTROL_TOOLS) {
		allow.add(tool);
	}

	return [...allow].join(",");
}

export function parseSkillList(skills: string | undefined): string[] {
	return (skills ?? "")
		.split(",")
		.map((skill) => skill.trim())
		.filter(Boolean);
}

export function buildPiPromptArgs(params: {
	effectiveSkills?: string;
	taskDelivery: "direct" | "artifact";
	taskArg: string;
	taskText: string;
}): string[] {
	const skills = parseSkillList(params.effectiveSkills);
	if (skills.length === 0) return [params.taskArg];

	const [first, ...rest] = skills;
	const extraSkillsNote =
		rest.length > 0
			? `Also read and follow these skills from your available skills list before you start: ${rest.join(", ")}.\n\n`
			: "";
	return [`/skill:${first} ${extraSkillsNote}${params.taskText}`];
}

function resolveUsageContextWindow(
	usage: SubagentUsageSummary,
	registry: LaunchContext["modelRegistry"],
): number | undefined {
	if (!usage.provider || !usage.model || !registry) return undefined;
	const model = registry
		.getAvailable()
		.find((candidate) => candidate.provider === usage.provider && candidate.id === usage.model);
	return model && model.contextWindow > 0 ? model.contextWindow : undefined;
}

export function resolveUsageDetails(
	result: Pick<SubagentResult, "usage">,
	ctx: LaunchContext,
): SubagentUsageSummary | undefined {
	if (!result.usage) return undefined;
	return withContextWindow(result.usage, resolveUsageContextWindow(result.usage, ctx.modelRegistry));
}

export function parseLegacyModelSelection(argument: string | undefined): ModelSelection | undefined {
	if (!argument) return undefined;
	let reference = argument;
	let thinking: ModelSelection["thinking"];
	const colon = reference.lastIndexOf(":");
	if (colon > 0 && THINKING_LEVELS.includes(reference.slice(colon + 1) as never)) {
		thinking = reference.slice(colon + 1) as ModelSelection["thinking"];
		reference = reference.slice(0, colon);
	}
	const slash = reference.indexOf("/");
	if (slash <= 0 || slash === reference.length - 1) return undefined;
	const selection: ModelSelection = {
		provider: reference.slice(0, slash),
		model: reference.slice(slash + 1),
	};
	if (thinking) selection.thinking = thinking;
	return selection;
}

export function resolveResumeLaunchBehavior(
	params: { autoExit?: boolean },
): { autoExit: boolean; interactive: boolean } {
	const autoExit = params.autoExit ?? true;
	return { autoExit, interactive: !autoExit };
}

export function buildResumePiArgs(sessionPath: string, modelArgument?: string): string[] {
	return [
		"pi",
		"--session",
		shellEscape(sessionPath),
		...(modelArgument ? ["--model", shellEscape(modelArgument)] : []),
	];
}

export function resolveResultPresentation(
	result: Pick<
		SubagentResult,
		"exitCode" | "elapsed" | "summary" | "sessionFile" | "errorMessage" | "usage"
	>,
	name: string,
): string {
	const sessionRef = result.sessionFile
		? `\n\nSession: ${result.sessionFile}\nResume: pi --session ${result.sessionFile}`
		: "";
	const usageBlock = formatUsageSummary(result.usage);
	const usageRef = usageBlock ? `\n\n${usageBlock}` : "";

	if (result.errorMessage) {
		return (
			`Sub-agent "${name}" failed after ${formatElapsed(result.elapsed)} `
			+ `(provider/agent error — auto-retry exhausted).\n\n`
			+ `Error: ${result.errorMessage}\n\n`
			+ "The subagent did not produce a result. You can retry by spawning a new "
			+ `subagent or resume the session with subagent_resume.${usageRef}${sessionRef}`
		);
	}

	return result.exitCode === 0
		? `Sub-agent "${name}" completed (${formatElapsed(result.elapsed)}).\n\n${result.summary}${usageRef}${sessionRef}`
		: `Sub-agent "${name}" failed (exit code ${result.exitCode}).\n\n${result.summary}${usageRef}${sessionRef}`;
}

export function sendSubagentPing(
	pi: ExtensionAPI,
	result: SubagentResult,
	agent: string | undefined,
	sessionPath: string | undefined,
	boundary?: PhaseBoundaryOutcome,
): void {
	if (!result.ping) return;
	const sessionRef = sessionPath ? `\n\nSession: ${sessionPath}\nResume: pi --session ${sessionPath}` : "";
	const violation = boundary?.violationText ? `\n\n${boundary.violationText}` : "";
	pi.sendMessage(
		{
			customType: "subagent_ping",
			content: `Sub-agent "${result.ping.name}" needs help (${formatElapsed(result.elapsed)}):\n\n${result.ping.message}${violation}${sessionRef}`,
			display: true,
			details: {
				name: result.ping.name,
				message: result.ping.message,
				agent,
				sessionFile: sessionPath,
				...(boundary ? boundary.details : {}),
			},
		},
		{ triggerTurn: true, deliverAs: "steer" },
	);
}

function copyClaudeSession(sentinelFile: string): string | null {
	try {
		const transcriptFile = sentinelFile + ".transcript";
		if (!existsSync(transcriptFile)) return null;
		const transcriptPath = readFileSync(transcriptFile, "utf-8").trim();
		if (!transcriptPath || !existsSync(transcriptPath)) return null;
		mkdirSync(CLAUDE_SESSIONS_DIR, { recursive: true });
		const filename = transcriptPath.split("/").pop() ?? `claude-${Date.now()}.jsonl`;
		const dest = join(CLAUDE_SESSIONS_DIR, filename);
		copyFileSync(transcriptPath, dest);
		return filename;
	} catch {
		return null;
	}
}

function fallbackSummary(result: { exitCode: number; errorMessage?: string }): string {
	if (result.errorMessage) return `Subagent error: ${result.errorMessage}`;
	return result.exitCode === 0
		? "Sub-agent exited without output"
		: `Sub-agent exited with code ${result.exitCode}`;
}

export function createSubagentExecutionServices(deps: SubagentServiceDependencies) {
	function findPrimarySkillPath(
		skillName: string,
		cwd?: string,
		agentDir?: string,
	): string | undefined {
		const candidates = [
			...(cwd
				? [
					join(cwd, ".pi", "skills", skillName, "SKILL.md"),
					join(cwd, ".agents", "skills", skillName, "SKILL.md"),
				]
				: []),
			join(process.cwd(), ".pi", "skills", skillName, "SKILL.md"),
			join(process.cwd(), ".agents", "skills", skillName, "SKILL.md"),
			...(agentDir ? [join(agentDir, "skills", skillName, "SKILL.md")] : []),
			join(deps.getAgentConfigDir(), "skills", skillName, "SKILL.md"),
			join(homedir(), ".agents", "skills", skillName, "SKILL.md"),
		];
		return candidates.find((path) => existsSync(path));
	}

	function resolvePrimarySkill(
		effectiveSkills: string | undefined,
		cwd?: string,
		agentDir?: string,
	): PrimarySkillIdentity | undefined {
		const primary = parseSkillList(effectiveSkills)[0];
		if (!primary) return undefined;
		const path = findPrimarySkillPath(primary, cwd, agentDir);
		if (!path) return undefined;
		try {
			return { name: primary, path, hash: hashText(readFileSync(path, "utf8")) };
		} catch {
			return undefined;
		}
	}

	function collectResourceFingerprints(
		pi: ExtensionAPI | undefined,
		effectiveSkills: string | undefined,
	): LaunchProfileResources {
		const tools = pi?.getActiveTools?.() ?? [];
		const namedSkills = parseSkillList(effectiveSkills);
		const commandSkills =
			pi?.getCommands?.().filter((command) => command.source === "skill").map((command) => command.name) ?? [];
		const visibleSkills = [...new Set([...namedSkills, ...commandSkills])];
		return {
			tools: fingerprintStrings(tools),
			visibleSkills: fingerprintStrings(visibleSkills),
			updatedAt: new Date().toISOString(),
		};
	}

	function buildLaunchProfile(input: LaunchProfileInput): LaunchProfile {
		const model = parseLegacyModelSelection(input.modelArgument);
		const primarySkill = resolvePrimarySkill(input.effectiveSkills, input.cwd, input.agentDir);
		const createdAt = new Date().toISOString();
		const workflow = input.workflow
			? normalizeLaunchProfileWorkflowMetadata(input.workflow)
			: undefined;
		return {
			version: 1,
			stable: {
				...(input.agentName ? { agentName: input.agentName } : {}),
				displayName: input.displayName,
				roleBody: input.roleBody,
				roleBodyHash: hashText(input.roleBody),
				systemPromptMode: input.systemPromptMode,
				cwd: input.cwd,
				agentDir: input.agentDir,
				controls: input.controls,
				...(primarySkill ? { primarySkill } : {}),
				originalSessionPath: input.originalSessionPath,
				createdAt,
			},
			runtime: {
				...(model ? { originalModel: model, lastModel: model } : {}),
				resumeCount: 0,
			},
			resources: input.resources,
			...(workflow ? { workflow } : {}),
		};
	}

	async function launchSubagent(
		rawParams: SubagentLaunchParams,
		ctx: LaunchContext,
		options?: {
			surface?: string;
			workflow?: LaunchProfileWorkflowMetadata;
			resolvedModel?: ResolvedModelSelection;
			rolloverFrom?: LaunchProfile;
			taskRuntime?: TaskRuntimeOptions;
		},
	): Promise<RunningSubagent> {
		const params = deps.normalizeSubagentParams(rawParams);
		const startTime = Date.now();
		const id = Math.random().toString(16).slice(2, 10);

		const rollover = options?.rolloverFrom;
		const taskRuntime = options?.taskRuntime;
		if (taskRuntime) {
			if (rollover) throw new Error("Task launches cannot be rollovers.");
			const maxTurns = taskRuntime.maxTurns;
			if (
				maxTurns != null
				&& (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1)
			) {
				throw new Error(
					`Invalid task maxTurns ${String(maxTurns)}: pass a positive integer or omit it for unlimited.`,
				);
			}
		}
		const agentDefs = !rollover && params.agent ? deps.loadAgentDefaults(params.agent) : null;
		const configuredModel = options?.resolvedModel
			? options.resolvedModel.selection.model
			: params.model ?? agentDefs?.model;
		const effectiveTools = rollover ? undefined : params.tools ?? agentDefs?.tools;
		const effectiveSkills = rollover
			? rollover.stable.primarySkill?.name
			: params.skills ?? agentDefs?.skills;
		const effectiveInteractive = rollover
			? rollover.stable.controls.interactive
			: taskRuntime
				? false
				: deps.resolveEffectiveInteractive(params, agentDefs);
		const autoExitForChild = rollover
			? rollover.stable.controls.autoExit
			: taskRuntime
				? true
				: agentDefs?.autoExit;

		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) throw new Error("No session file");
		const sessionId = ctx.sessionManager.getSessionId();
		const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), sessionId);

		const resolvedPaths = deps.resolveSubagentPaths(params, agentDefs);
		const effectiveCwd = resolvedPaths.effectiveCwd;
		const effectiveAgentDir = rollover ? rollover.stable.agentDir : resolvedPaths.effectiveAgentDir;
		const localAgentDir = rollover
			? (existsSync(rollover.stable.agentDir) ? rollover.stable.agentDir : null)
			: resolvedPaths.localAgentDir;
		const targetCwdForSession = effectiveCwd ?? ctx.cwd;
		const sessionDir = getDefaultSessionDirFor(targetCwdForSession, effectiveAgentDir);

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23) + "Z";
		const uuid = [
			id,
			Math.random().toString(16).slice(2, 10),
			Math.random().toString(16).slice(2, 10),
			Math.random().toString(16).slice(2, 6),
		].join("-");
		const subagentSessionFile = join(sessionDir, `${timestamp}_${uuid}.jsonl`);

		const surfacePreCreated = !!options?.surface;
		const surface = options?.surface ?? deps.createSurface(params.name);
		if (!surfacePreCreated) {
			await new Promise<void>((resolve) => setTimeout(resolve, getShellReadyDelayMs()));
		}

		const launchBehavior = deps.resolveLaunchBehavior(params, agentDefs);

		if (launchBehavior.seededSessionMode) {
			seedSubagentSessionFile({
				mode: launchBehavior.seededSessionMode,
				parentSessionFile: sessionFile,
				childSessionFile: subagentSessionFile,
				childCwd: targetCwdForSession,
			});
		}

		const activityFile = getSubagentActivityFile(artifactDir, id);
		mkdirSync(dirname(activityFile), { recursive: true });
		const { inheritsConversationContext } = launchBehavior;

		const modeHint = autoExitForChild
			? "Complete your task autonomously."
			: "Complete your task. When finished, call the subagent_done tool. The user can interact with you at any time.";
		const summaryInstruction = autoExitForChild
			? "Your FINAL assistant message should summarize what you accomplished."
			: "Your FINAL assistant message (before calling subagent_done or before the user exits) should summarize what you accomplished.";
		const denySet = rollover
			? new Set(rollover.stable.controls.denyTools)
			: deps.resolveDenyTools(agentDefs);
		const identity = rollover
			? (rollover.stable.roleBody || null)
			: agentDefs?.body ?? params.systemPrompt ?? null;
		const systemPromptMode = rollover ? rollover.stable.systemPromptMode : agentDefs?.systemPromptMode;
		const systemPromptFileMode =
			systemPromptMode === "append" || systemPromptMode === "replace" ? systemPromptMode : undefined;
		const identityInSystemPrompt = systemPromptFileMode && identity;
		const roleBlock = identity && !identityInSystemPrompt ? `\n\n${identity}` : "";
		const fullTask = inheritsConversationContext
			? params.task
			: `${roleBlock}\n\n${modeHint}\n\n${params.task}\n\n${summaryInstruction}`.trim();

		const safeName = toSafeFileName(params.name || "subagent", "subagent");
		const launchScriptFile = join(artifactDir, "subagent-scripts", `${safeName}-${id}.sh`);
		const piModelArgument = options?.resolvedModel?.argument ?? deps.resolvePiModelArgument(params, agentDefs, {
			model: ctx.model,
			thinkingLevel: ctx.thinkingLevel,
		});
		const launchProfile = buildLaunchProfile({
			displayName: params.name,
			...(rollover
				? (rollover.stable.agentName ? { agentName: rollover.stable.agentName } : {})
				: params.agent
					? { agentName: params.agent }
					: {}),
			roleBody: identity ?? "",
			systemPromptMode: rollover ? rollover.stable.systemPromptMode : agentDefs?.systemPromptMode ?? "message",
			cwd: targetCwdForSession,
			agentDir: effectiveAgentDir,
			controls: rollover
				? {
					...rollover.stable.controls,
					sessionMode: launchBehavior.sessionMode,
				}
				: {
					...(agentDefs?.spawning === undefined ? {} : { spawning: agentDefs.spawning }),
					denyTools: [...denySet].sort((first, second) => first.localeCompare(second)),
					...(taskRuntime
						? { autoExit: true }
						: agentDefs?.autoExit === undefined
							? {}
							: { autoExit: agentDefs.autoExit }),
					interactive: effectiveInteractive,
					sessionMode: launchBehavior.sessionMode,
				},
			effectiveSkills,
			modelArgument: piModelArgument,
			originalSessionPath: subagentSessionFile,
			resources: collectResourceFingerprints(ctx.pi, effectiveSkills),
			...(options?.workflow ? { workflow: options.workflow } : {}),
		});

		if (agentDefs?.cli === "claude") {
			const sentinelFile = `/tmp/pi-claude-${id}-done`;
			const pluginDir = join(deps.subagentsDir, "plugin");

			const cmdParts: string[] = [];
			cmdParts.push(`PI_CLAUDE_SENTINEL=${shellEscape(sentinelFile)}`);
			cmdParts.push("claude");
			cmdParts.push("--dangerously-skip-permissions");

			if (existsSync(pluginDir)) {
				cmdParts.push("--plugin-dir", shellEscape(pluginDir));
			}

			if (configuredModel) {
				cmdParts.push("--model", shellEscape(configuredModel));
			}

			const systemPrompt = params.systemPrompt ?? agentDefs.body;
			if (systemPrompt) {
				cmdParts.push("--append-system-prompt", shellEscape(systemPrompt));
			}

			if (params.resumeSessionId) {
				cmdParts.push("--resume", shellEscape(params.resumeSessionId));
			}

			cmdParts.push(shellEscape(params.task));

			const cdPrefix = effectiveCwd ? `cd ${shellEscape(effectiveCwd)} && ` : "";
			const command = `${cdPrefix}${cmdParts.join(" ")}; echo '__SUBAGENT_DONE_'$?'__'`;

			writeLaunchProfile(subagentSessionFile, launchProfile);
			try {
				deps.sendLongCommand(surface, command, {
					scriptPath: launchScriptFile,
					scriptPreamble: [
						`# Claude Code subagent launch script for ${params.name}`,
						`# Generated: ${new Date().toISOString()}`,
						`# Surface: ${surface}`,
					].join("\n"),
				});
			} catch (error) {
				removeLaunchProfile(subagentSessionFile);
				throw error;
			}

			const running: RunningSubagent = {
				id,
				name: params.name,
				task: params.task,
				agent: params.agent,
				surface,
				startTime,
				sessionFile: subagentSessionFile,
				launchScriptFile,
				cli: "claude",
				sentinelFile,
				interactive: effectiveInteractive,
				statusState: createStatusState({ source: "claude", startTimeMs: startTime }),
			};

			deps.runningSubagents.set(id, running);
			return running;
		}

		const parts: string[] = ["pi"];
		parts.push("--session", shellEscape(subagentSessionFile));

		const subagentDonePath = join(deps.subagentsDir, "subagent-done.ts");
		parts.push("-e", shellEscape(subagentDonePath));

		if (piModelArgument) {
			parts.push("--model", shellEscape(piModelArgument));
		}

		if (identityInSystemPrompt && identity) {
			const flag = systemPromptMode === "replace" ? "--system-prompt" : "--append-system-prompt";
			const syspromptPath = join(artifactDir, `context/${safeName}-sysprompt-${fileTimestamp()}.md`);
			mkdirSync(dirname(syspromptPath), { recursive: true });
			writeFileSync(syspromptPath, identity, "utf8");
			parts.push(flag, shellEscape(syspromptPath));
		}

		const toolAllowlist = buildSubagentToolAllowlist(effectiveTools);
		if (toolAllowlist) {
			parts.push("--tools", shellEscape(toolAllowlist));
		}

		const envParts: string[] = [];

		if (localAgentDir && existsSync(localAgentDir)) {
			envParts.push(`PI_CODING_AGENT_DIR=${shellEscape(localAgentDir)}`);
		} else if (process.env.PI_CODING_AGENT_DIR) {
			envParts.push(`PI_CODING_AGENT_DIR=${shellEscape(process.env.PI_CODING_AGENT_DIR)}`);
		}

		if (denySet.size > 0) {
			envParts.push(`PI_DENY_TOOLS=${shellEscape([...denySet].join(","))}`);
		}
		envParts.push(`PI_SUBAGENT_NAME=${shellEscape(params.name)}`);
		const childAgentName = rollover ? rollover.stable.agentName : params.agent;
		if (childAgentName) {
			envParts.push(`PI_SUBAGENT_AGENT=${shellEscape(childAgentName)}`);
		}
		if (autoExitForChild) {
			envParts.push("PI_SUBAGENT_AUTO_EXIT=1");
		}
		if (taskRuntime?.maxTurns != null) {
			envParts.push(`PI_SUBAGENT_MAX_TURNS=${taskRuntime.maxTurns}`);
		}
		envParts.push(`PI_SUBAGENT_SESSION=${shellEscape(subagentSessionFile)}`);
		envParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
		envParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`);
		envParts.push(`PI_SUBAGENT_SURFACE=${shellEscape(surface)}`);
		const envPrefix = envParts.join(" ") + " ";

		let taskArg: string;
		if (launchBehavior.taskDelivery === "direct") {
			taskArg = fullTask;
		} else {
			const artifactPath = join(artifactDir, `context/${safeName}-${fileTimestamp()}.md`);
			mkdirSync(dirname(artifactPath), { recursive: true });
			writeFileSync(artifactPath, fullTask, "utf8");
			taskArg = `@${artifactPath}`;
		}

		for (const promptArg of buildPiPromptArgs({
			effectiveSkills,
			taskDelivery: launchBehavior.taskDelivery,
			taskArg,
			taskText: fullTask,
		})) {
			parts.push(shellEscape(promptArg));
		}

		const cdPrefix = effectiveCwd ? `cd ${shellEscape(effectiveCwd)} && ` : "";
		const piCommand = cdPrefix + envPrefix + parts.join(" ");
		const command = `${piCommand}; echo '__SUBAGENT_DONE_'$?'__'`;
		writeLaunchProfile(subagentSessionFile, launchProfile);
		try {
			deps.sendLongCommand(surface, command, {
				scriptPath: launchScriptFile,
				scriptPreamble: [
					`# Subagent launch script for ${params.name}`,
					`# Generated: ${new Date().toISOString()}`,
					`# Session: ${subagentSessionFile}`,
					`# Surface: ${surface}`,
				].join("\n"),
			});
		} catch (error) {
			removeLaunchProfile(subagentSessionFile);
			throw error;
		}

		const running: RunningSubagent = {
			id,
			name: params.name,
			task: params.task,
			agent: params.agent,
			surface,
			startTime,
			sessionFile: subagentSessionFile,
			launchScriptFile,
			activityFile,
			interactive: effectiveInteractive,
			statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
		};

		deps.runningSubagents.set(id, running);
		return running;
	}

	async function watchSubagent(
		running: RunningSubagent,
		signal: AbortSignal,
	): Promise<SubagentResult> {
		const { name, task, surface, startTime, sessionFile } = running;

		try {
			const result = await deps.pollForExit(
				surface,
				AbortSignal.any([signal, deps.getModuleAbortSignal()]),
				{
					interval: 1000,
					sessionFile,
					sentinelFile: running.sentinelFile,
					onTick() {
						deps.observeRunningSubagent(running);
					},
				},
			);

			const elapsed = Math.floor((Date.now() - startTime) / 1000);

			if (running.cli === "claude") {
				let summary = "";

				if (running.sentinelFile) {
					try {
						summary = readFileSync(running.sentinelFile, "utf-8").trim();
					} catch {
						// The sentinel summary is optional; screen capture is the fallback.
					}
				}

				if (!summary) {
					summary = deps.readScreen(surface, 200)
						.replace(/__SUBAGENT_DONE_\d+__/, "")
						.trimEnd();
				}

				const responded = Boolean(summary);
				if (!summary) {
					summary = result.exitCode === 0
						? "Claude Code exited without output"
						: `Claude Code exited with code ${result.exitCode}`;
				}

				let claudeSessionId: string | null = null;
				if (running.sentinelFile) {
					claudeSessionId = copyClaudeSession(running.sentinelFile);
					try {
						unlinkSync(running.sentinelFile);
					} catch {
						// Cleanup is best-effort; the pane is closing regardless.
					}
					try {
						unlinkSync(running.sentinelFile + ".transcript");
					} catch {
						// Cleanup is best-effort; the pane is closing regardless.
					}
				}

				deps.closeSurface(surface);
				deps.runningSubagents.delete(running.id);

				return {
					name,
					task,
					summary,
					exitCode: result.exitCode,
					elapsed,
					responded,
					...(claudeSessionId ? { claudeSessionId } : {}),
				};
			}

			let summary: string;
			let usage: SubagentUsageSummary | undefined;
			let responded = false;
			if (existsSync(sessionFile)) {
				const allEntries = getNewEntries(sessionFile, 0);
				const assistantMessage = findLastAssistantMessage(allEntries);
				responded = assistantMessage !== null;
				summary = assistantMessage ?? fallbackSummary(result);
				const aggregated = summarizeSubagentUsage(allEntries);
				if (aggregated.requests > 0) usage = aggregated;
			} else {
				summary = fallbackSummary(result);
			}

			deps.closeSurface(surface);
			deps.runningSubagents.delete(running.id);

			return {
				name,
				task,
				summary,
				sessionFile,
				exitCode: result.exitCode,
				elapsed,
				responded,
				ping: result.ping,
				...(result.reason === "turn-limit" ? { turnLimit: true } : {}),
				...(usage ? { usage } : {}),
				...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
			};
		} catch (error) {
			try {
				deps.closeSurface(surface);
			} catch {
				// The pane may already be gone after a tmux failure.
			}
			deps.runningSubagents.delete(running.id);

			const message = error instanceof Error ? error.message : String(error);
			if (signal.aborted) {
				return {
					name,
					task,
					summary: "Subagent cancelled.",
					exitCode: 1,
					elapsed: Math.floor((Date.now() - startTime) / 1000),
					error: "cancelled",
					sessionFile,
				};
			}
			return {
				name,
				task,
				summary: `Subagent error: ${message}`,
				exitCode: 1,
				elapsed: Math.floor((Date.now() - startTime) / 1000),
				error: message,
			};
		}
	}

	function watchInBackground(options: BackgroundWatchOptions): AbortController {
		const watcherAbort = new AbortController();
		options.running.abortController = watcherAbort;
		deps.startWidgetRefresh();
		deps.startStatusRefresh(options.pi);

		void watchSubagent(options.running, watcherAbort.signal)
			.then(async (result) => {
				deps.updateWidget();

				const boundary = deps.describeBoundary?.(options.running);
				if (result.ping) {
					await options.onPing?.({ result, boundary });
					sendSubagentPing(
						options.pi,
						result,
						options.pingAgent,
						options.pingSessionPath,
						boundary,
					);
					return;
				}

				const presentation = await options.onSuccess({ result, boundary });
				options.pi.sendMessage(
					{
						customType: "subagent_result",
						content: presentation.content,
						display: true,
						details: presentation.details,
					},
					{ triggerTurn: true, deliverAs: "steer" },
				);
			})
			.catch(async (error) => {
				deps.updateWidget();
				const message = error instanceof Error ? error.message : String(error);
				try {
					const presentation = await options.onError(message);
					options.pi.sendMessage(
						{
							customType: "subagent_result",
							content: presentation.content,
							display: true,
							details: presentation.details,
						},
						{ triggerTurn: true, deliverAs: "steer" },
					);
				} catch {
					options.pi.sendMessage(
						{
							customType: "subagent_result",
							content: `Sub-agent "${options.running.name}" error: ${message}`,
							display: true,
							details: { name: options.running.name, error: message },
						},
						{ triggerTurn: true, deliverAs: "steer" },
					);
				}
			});

		return watcherAbort;
	}

	function cleanupFailedPostLaunch(
		running: RunningSubagent,
		watcherAbort?: AbortController,
	): void {
		watcherAbort?.abort();
		try {
			deps.closeSurface(running.surface);
		} catch {
			// The watcher or child process may already have closed the surface.
		}
		deps.runningSubagents.delete(running.id);
		deps.updateWidget();
	}

	async function executeSubagentResume(
		pi: ExtensionAPI,
		params: SubagentResumeParams,
		ctx: LaunchContext & Parameters<typeof resolveModelPolicy>[1],
		recovery?: ResumeRecoveryContext,
		lifecycle?: ResumeLifecycleContext,
	): Promise<SubagentToolResult> {
		const name = params.name ?? "Resume";
		const startTime = Date.now();
		const id = Math.random().toString(16).slice(2, 10);

		if (!existsSync(params.sessionPath)) {
			return {
				content: [
					{ type: "text", text: `Error: session file not found: ${params.sessionPath}` },
				],
				details: { error: "session not found" },
			};
		}

		let profileRead = readLaunchProfile(params.sessionPath);
		if (profileRead.status === "invalid") {
			return {
				content: [{ type: "text", text: `Error: ${profileRead.error}` }],
				details: { error: "invalid launch profile" },
			};
		}
		if (profileRead.status === "ok" && lifecycle?.workflowMetadata) {
			try {
				const workflow = normalizeLaunchProfileWorkflowMetadata(
					lifecycle.workflowMetadata,
				);
				const profile = updateLaunchProfile(params.sessionPath, (stored) => ({
					...stored,
					workflow,
				}));
				profileRead = { status: "ok", profile };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: could not update workflow metadata: ${message}` }],
					details: { error: "workflow metadata update failed", message },
				};
			}
		}

		const restoration = resolveResumeRestoration(
			profileRead.status === "ok" ? profileRead.profile : null,
			params,
		);
		const { autoExit, interactive } = restoration;
		const resumeWarnings: string[] = [];
		let freshForPrimarySkillChange = false;
		if (restoration.legacyWarning) {
			resumeWarnings.push(restoration.legacyWarning);
			await ctx.ui?.notify?.(restoration.legacyWarning, "warning");
		}

		const currentResources = collectResourceFingerprints(
			pi,
			profileRead.status === "ok" ? profileRead.profile.stable.primarySkill?.name : undefined,
		);
		if (profileRead.status === "ok") {
			const resourceChanges = diffResourceFingerprints(
				profileRead.profile.resources,
				currentResources,
			);
			const notice = resourceChangeNotice(resourceChanges);
			if (notice) {
				resumeWarnings.push(notice);
				await ctx.ui?.notify?.(`Resume uses current resources: ${notice}`, "info");
			}

			const currentPrimarySkill = restoration.agentDir
				? resolvePrimarySkill(
					profileRead.profile.stable.primarySkill?.name,
					restoration.cwd,
					restoration.agentDir,
				)
				: undefined;
			if (
				profileRead.profile.stable.primarySkill
				&& primarySkillChanged(profileRead.profile, currentPrimarySkill)
			) {
				const choice = await ctx.ui?.select?.(
					`The ${profileRead.profile.stable.primarySkill.name} skill definition changed since this session was launched.`,
					[
						"Resume with the older instructions",
						"Start a fresh same-role session with the latest skill",
						"Stop this resume",
					],
				);
				if (choice === "Start a fresh same-role session with the latest skill") {
					freshForPrimarySkillChange = true;
				} else if (choice !== "Resume with the older instructions") {
					return {
						content: [{
							type: "text",
							text: "Resume cancelled because the primary skill definition changed.",
						}],
						details: {
							error: "primary skill changed",
							skill: profileRead.profile.stable.primarySkill.name,
						},
					};
				}
			}
		}

		const profile = profileRead.status === "ok" ? profileRead.profile : null;
		const boundarySnapshot = lifecycle?.boundary ?? deps.captureResumeBoundary?.(profile, ctx);

		let estimate: SavedContextEstimate | undefined;
		try {
			estimate = estimateSavedSessionContext(params.sessionPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			resumeWarnings.push(`Context estimate unavailable (${message}); rollover gate skipped.`);
		}

		let resolvedModel: ResolvedModelSelection | undefined;
		let fit: ContextFit | undefined;
		let rollover: { profile: LaunchProfile; selection: ResolvedModelSelection } | undefined;
		let modelPolicy = params.model;
		const resumeSubject = recovery?.pickerSubject ?? params.name ?? profile?.stable.displayName ?? "subagent";
		const lastModel = profile?.runtime.lastModel;
		const pickerPrompt = {
			title: recovery?.pickerTitle ?? `Resume model for ${resumeSubject}`,
			subject: resumeSubject,
			...(lastModel
				? {
					currentRef: `${lastModel.provider}/${lastModel.model}${lastModel.thinking ? `:${lastModel.thinking}` : ""}`,
				}
				: {}),
		};
		while (true) {
			try {
				const resolution = await resolveModelPolicy(modelPolicy, ctx, {
					mode: "resume",
					...(profile ? { profile } : {}),
					...(estimate ? { contextTokens: estimate.tokens } : {}),
					picker: pickerPrompt,
				});
				if (resolution.source === "legacy") {
					resolvedModel = undefined;
					fit = undefined;
				} else {
					resolvedModel = resolution;
					const contextWindow = resolution.model.contextWindow;
					fit =
						estimate && Number.isFinite(contextWindow) && contextWindow > 0
							? calculateContextFit(estimate.tokens, contextWindow)
							: undefined;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { error: "model selection failed", message },
				};
			}

			if (freshForPrimarySkillChange) {
				if (!profile || !resolvedModel) {
					return {
						content: [{
							type: "text",
							text: "Error: a fresh latest-skill rollover needs a launch-profile sidecar and a selected model.",
						}],
						details: { error: "primary skill rollover unavailable" },
					};
				}
				rollover = { profile, selection: resolvedModel };
				break;
			}

			if (!fit?.requiresGate) break;

			let action: Awaited<ReturnType<typeof chooseResumeGateAction>>;
			try {
				action = await chooseResumeGateAction(ctx, fit);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { error: "context gate unavailable", message },
				};
			}
			if (action === "choose") {
				modelPolicy = "pick";
				continue;
			}
			if (action === "stop") {
				return {
					content: [{
						type: "text",
						text: "Resume cancelled at the context-fit gate. The saved session was not changed.",
					}],
					details: {
						error: "resume cancelled at context gate",
						contextRatio: fit.ratio,
						...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
					},
				};
			}
			if (action === "fresh") {
				if (!profile || !resolvedModel) {
					return {
						content: [{
							type: "text",
							text: "Error: a fresh same-role rollover needs a launch-profile sidecar and a selected model. Choose 'Resume the saved session anyway' or 'Choose another model'.",
						}],
						details: { error: "rollover unavailable without sidecar" },
					};
				}
				rollover = { profile, selection: resolvedModel };
			}
			break;
		}

		if (!deps.isTmuxAvailable()) {
			return deps.muxUnavailableResult();
		}

		const executionDetails = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
			...(lifecycle?.details ?? {}),
			...(recovery?.details ?? {}),
			...extra,
		});

		if (rollover) {
			const rolloverProfile = rollover.profile;
			const sourceWorkflow = lifecycle?.workflowMetadata ?? rolloverProfile.workflow;
			const baseWorkflow = sourceWorkflow
				? {
					...sourceWorkflow,
					currentDefault: rollover.selection.selection,
				}
				: undefined;
			const workflowMetadata = baseWorkflow && recovery?.transformWorkflowMetadata
				? recovery.transformWorkflowMetadata(baseWorkflow, rollover.selection)
				: baseWorkflow;
			const running = await launchSubagent(
				{
					name: params.name ?? rolloverProfile.stable.displayName,
					task: lifecycle?.rolloverMessage
						?? buildRolloverHandoff(rolloverProfile, params.message),
					systemPrompt: rolloverProfile.stable.roleBody || undefined,
					cwd: rolloverProfile.stable.cwd,
				},
				{ ...ctx, pi },
				{
					resolvedModel: rollover.selection,
					rolloverFrom: rolloverProfile,
					...(workflowMetadata ? { workflow: workflowMetadata } : {}),
				},
			);

			if (boundarySnapshot !== undefined) running.boundary = boundarySnapshot;
			let lineageWarnings: string[] = [];
			let watcherAbort: AbortController | undefined;
			try {
				watcherAbort = watchInBackground({
					pi,
					ctx,
					running,
					pingAgent: rolloverProfile.stable.agentName,
					pingSessionPath: running.sessionFile,
					onPing: async ({ result, boundary }) => {
						await lifecycle?.onResult?.({
							result,
							boundary,
							replacement: true,
							originalSessionPath: params.sessionPath,
							sessionPath: running.sessionFile,
						});
					},
					onSuccess: async ({ result, boundary }) => {
						if (
							recovery
							&& result.exitCode === 0
							&& !result.errorMessage
							&& result.responded
						) {
							await recovery.onSuccessfulResponse?.(rollover.selection.selection);
						}
						await lifecycle?.onResult?.({
							result,
							boundary,
							replacement: true,
							originalSessionPath: params.sessionPath,
							sessionPath: running.sessionFile,
						});

						const usage = resolveUsageDetails(result, ctx);
						const base = resolveResultPresentation(
							{ ...result, ...(usage ? { usage } : {}) },
							running.name,
						);
						const presentation = boundary?.violationText
							? `${boundary.violationText}\n\n${base}`
							: base;
						return {
							content: presentation,
							details: executionDetails({
								name: running.name,
								task: running.task,
								agent: rolloverProfile.stable.agentName,
								exitCode: result.exitCode,
								elapsed: result.elapsed,
								sessionFile: running.sessionFile,
								rollover: "fresh",
								originalSessionPath: params.sessionPath,
								...(usage ? { usage } : {}),
								...(result.errorMessage
									? {
										errorMessage: result.errorMessage,
										failureKind: classifyProviderFailure(result.errorMessage),
									}
									: {}),
								...(boundary ? boundary.details : {}),
							}),
						};
					},
					onError: async (message) => {
						await lifecycle?.onError?.({
							message,
							replacement: true,
							originalSessionPath: params.sessionPath,
							sessionPath: running.sessionFile,
						});
						return {
							content: `Rollover "${running.name}" error: ${message}`,
							details: executionDetails({
								name: running.name,
								error: message,
								rollover: "fresh",
								originalSessionPath: params.sessionPath,
							}),
						};
					},
				});

				await lifecycle?.onLaunched?.({
					running,
					replacement: true,
					originalSessionPath: params.sessionPath,
					sessionPath: running.sessionFile,
				});
				await deps.onRolloverLaunched?.({
					running,
					rolloverProfile,
					params,
					...(recovery ? { recovery } : {}),
				});

				lineageWarnings = linkRolloverLineage(params.sessionPath, running.sessionFile);
				if (lineageWarnings.length > 0) {
					await ctx.ui?.notify?.(
						`Rollover lineage incomplete: ${lineageWarnings.join("; ")}`,
						"warning",
					);
				}
			} catch (error) {
				cleanupFailedPostLaunch(running, watcherAbort);
				throw error;
			}

			return {
				content: [{
					type: "text",
					text:
						`Fresh same-role session "${running.name}" launched in place of the saved conversation. `
						+ "It does not inherit the old conversation; it continues from the role snapshot and handoff artifacts.\n\n"
						+ `Replacement session: ${running.sessionFile}\n`
						+ `Replaced session: ${params.sessionPath}`,
				}],
				details: executionDetails({
					id: running.id,
					name: running.name,
					status: "started",
					rollover: "fresh",
					originalSessionPath: params.sessionPath,
					replacementSessionPath: running.sessionFile,
					sessionFile: running.sessionFile,
					launchScriptFile: running.launchScriptFile,
					...(lineageWarnings.length > 0 ? { lineageWarnings } : {}),
					...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
				}),
			};
		}

		const entryCountBefore = getNewEntries(params.sessionPath, 0).length;
		const surface = deps.createSurface(name);
		await new Promise<void>((resolve) => setTimeout(resolve, getShellReadyDelayMs()));

		const parts = buildResumePiArgs(params.sessionPath, resolvedModel?.argument);
		const subagentDonePath = join(deps.subagentsDir, "subagent-done.ts");
		parts.push("-e", shellEscape(subagentDonePath));

		const sessionId = ctx.sessionManager.getSessionId();
		const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), sessionId);
		const activityFile = getSubagentActivityFile(artifactDir, id);
		mkdirSync(dirname(activityFile), { recursive: true });

		const safeName = toSafeFileName(name, "resume");
		if (
			restoration.roleBody
			&& (restoration.systemPromptMode === "append" || restoration.systemPromptMode === "replace")
		) {
			const flag = restoration.systemPromptMode === "replace"
				? "--system-prompt"
				: "--append-system-prompt";
			const syspromptPath = join(
				artifactDir,
				"subagent-resume",
				`${safeName}-sysprompt-${fileTimestamp()}.md`,
			);
			mkdirSync(dirname(syspromptPath), { recursive: true });
			writeFileSync(syspromptPath, restoration.roleBody, "utf8");
			parts.push(flag, shellEscape(syspromptPath));
		}

		let resumeMsgFile: string | undefined;
		if (params.message) {
			resumeMsgFile = join(artifactDir, "subagent-resume", `${safeName}-${fileTimestamp()}.md`);
			mkdirSync(dirname(resumeMsgFile), { recursive: true });
			writeFileSync(resumeMsgFile, params.message, "utf8");
			parts.push(shellEscape(`@${resumeMsgFile}`));
		}

		const resumeEnvParts: string[] = [];
		if (restoration.agentDir && existsSync(restoration.agentDir)) {
			resumeEnvParts.push(`PI_CODING_AGENT_DIR=${shellEscape(restoration.agentDir)}`);
		} else if (process.env.PI_CODING_AGENT_DIR) {
			resumeEnvParts.push(`PI_CODING_AGENT_DIR=${shellEscape(process.env.PI_CODING_AGENT_DIR)}`);
		}
		if (restoration.denyTools.length > 0) {
			resumeEnvParts.push(`PI_DENY_TOOLS=${shellEscape(restoration.denyTools.join(","))}`);
		}
		resumeEnvParts.push(`PI_SUBAGENT_NAME=${shellEscape(name)}`);
		if (restoration.agentName) {
			resumeEnvParts.push(`PI_SUBAGENT_AGENT=${shellEscape(restoration.agentName)}`);
		}
		resumeEnvParts.push(`PI_SUBAGENT_SESSION=${shellEscape(params.sessionPath)}`);
		resumeEnvParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
		resumeEnvParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`);
		if (autoExit) {
			resumeEnvParts.push("PI_SUBAGENT_AUTO_EXIT=1");
		}
		const resumeEnvPrefix = resumeEnvParts.join(" ") + " ";

		const resumeCommand = parts.join(" ");
		const cdPrefix = restoration.cwd ? `cd ${shellEscape(restoration.cwd)} && ` : "";
		const command = `${cdPrefix}${resumeEnvPrefix}${resumeCommand}; echo '__SUBAGENT_DONE_'$?'__'`;
		const launchScriptFile = join(artifactDir, "subagent-scripts", `${safeName}-resume-${Date.now()}.sh`);
		deps.sendLongCommand(surface, command, {
			scriptPath: launchScriptFile,
			scriptPreamble: [
				`# Subagent resume script for ${name}`,
				`# Generated: ${new Date().toISOString()}`,
				`# Session: ${params.sessionPath}`,
				`# Surface: ${surface}`,
				...(resumeMsgFile ? [`# Resume message file: ${resumeMsgFile}`] : []),
			].join("\n"),
		});

		const running: RunningSubagent = {
			id,
			name,
			task: params.message ?? "resumed session",
			surface,
			startTime,
			sessionFile: params.sessionPath,
			launchScriptFile,
			activityFile,
			interactive,
			statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
		};
		if (boundarySnapshot !== undefined) running.boundary = boundarySnapshot;
		deps.runningSubagents.set(id, running);
		let watcherAbort: AbortController | undefined;
		try {
			watcherAbort = watchInBackground({
				pi,
				ctx,
				running,
				pingSessionPath: params.sessionPath,
				onPing: async ({ result, boundary }) => {
					await lifecycle?.onResult?.({
						result,
						boundary,
						replacement: false,
						originalSessionPath: params.sessionPath,
						sessionPath: params.sessionPath,
					});
				},
				onSuccess: async ({ result, boundary }) => {
					const newEntries = getNewEntries(params.sessionPath, entryCountBefore);
					const assistantResponse = findLastAssistantMessage(newEntries);
					if (
						profileRead.status === "ok"
						&& result.exitCode === 0
						&& !result.errorMessage
						&& assistantResponse !== null
					) {
						try {
							updateLaunchProfile(params.sessionPath, (stored) =>
								updateProfileAfterSuccessfulResponse(stored, {
									...(resolvedModel?.selection ? { selection: resolvedModel.selection } : {}),
									resources: currentResources,
									...(fit ? { contextEstimate: toContextEstimateRecord(fit) } : {}),
									...(recovery ? { previousFailure: recovery.failure } : {}),
								}));
						} catch {
							// Profile updates are best-effort; the response is already complete.
						}
						if (recovery && resolvedModel?.selection) {
							await recovery.onSuccessfulResponse?.(resolvedModel.selection);
						}
					}
					await lifecycle?.onResult?.({
						result,
						boundary,
						replacement: false,
						originalSessionPath: params.sessionPath,
						sessionPath: params.sessionPath,
					});
					const summary =
						assistantResponse ??
						(result.errorMessage
							? `Subagent error: ${result.errorMessage}`
							: result.exitCode === 0
								? "Resumed session exited without new output"
								: `Resumed session exited with code ${result.exitCode}`);
					const usage = resolveUsageDetails(result, ctx);
					const presentation = resolveResultPresentation(
						{ ...result, summary, sessionFile: params.sessionPath, ...(usage ? { usage } : {}) },
						name,
					);
					const content = boundary?.violationText
						? `${boundary.violationText}\n\n${presentation}`
						: presentation;

					return {
						content,
						details: executionDetails({
							name,
							task: params.message ?? "resumed session",
							exitCode: result.exitCode,
							elapsed: result.elapsed,
							sessionFile: params.sessionPath,
							...(result.errorMessage
								? {
									errorMessage: result.errorMessage,
									failureKind: classifyProviderFailure(result.errorMessage),
								}
								: {}),
							...(usage ? { usage } : {}),
							...(boundary ? boundary.details : {}),
						}),
					};
				},
				onError: async (message) => {
					await lifecycle?.onError?.({
						message,
						replacement: false,
						originalSessionPath: params.sessionPath,
						sessionPath: params.sessionPath,
					});
					return {
						content: `Resume error: ${message}`,
						details: executionDetails({ name, error: message }),
					};
				},
			});

			await lifecycle?.onLaunched?.({
				running,
				replacement: false,
				originalSessionPath: params.sessionPath,
				sessionPath: params.sessionPath,
			});
		} catch (error) {
			cleanupFailedPostLaunch(running, watcherAbort);
			throw error;
		}

		return {
			content: [{ type: "text", text: `Session "${name}" resumed.` }],
			details: executionDetails({
				id,
				name,
				sessionPath: params.sessionPath,
				launchScriptFile,
				status: "started",
				...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
			}),
		};
	}

	return {
		resolvePrimarySkill,
		collectResourceFingerprints,
		buildLaunchProfile,
		launchSubagent,
		watchSubagent,
		watchInBackground,
		executeSubagentResume,
	};
}

function getDefaultSessionDirFor(cwd: string, agentDir: string): string {
	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	const sessionDir = join(agentDir, "sessions", safePath);
	if (!existsSync(sessionDir)) {
		mkdirSync(sessionDir, { recursive: true });
	}
	return sessionDir;
}
