import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SubagentActivityState } from "../telemetry/activity.ts";
import type {
	LaunchProfile,
	LaunchProfileResources,
	LaunchProfileWorkflowMetadata,
	ModelSelection,
	ProviderFailureRecord,
} from "./launch-profile.ts";
import type { ResolvedModelSelection } from "../profiles/model-picker.ts";
import type { SubagentStatusState } from "../telemetry/status.ts";
import type { SubagentUsageSummary } from "../telemetry/usage.ts";

export interface LaunchContext {
	pi?: ExtensionAPI;
	sessionManager: {
		getSessionFile(): string | undefined | null;
		getSessionId(): string;
		getSessionDir(): string;
		getLeafId?(): string | null;
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
	isError?: boolean;
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
	/** Set only after closeSurface succeeds (including an already-absent pane). */
	surfaceClosed?: boolean;
	cli?: string;
	sentinelFile?: string;
	statusState: SubagentStatusState;
	interactive: boolean;
	/** Start of this workflow role's current run; excludes prior resume answers. */
	workflowSummaryStartLine?: number;
	team?: { teamId: string; memberId: string; epoch: number; sessionId: string };
}

export interface TeamLaunchSpec {
	directory: string;
	teamId: string;
	memberId: string;
	memberToken: string;
	memberEpoch: number;
	childSessionId: string;
	childSessionFile: string;
	leadSessionId: string;
	taskFile: string;
	expectedStoreFingerprint: string;
	expectedConfigFingerprint: string;
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
	/** A workflow resume must not publish into a branch it no longer owns. */
	isOwned?: () => boolean;
	/** Synchronous execution-cwd check before creating a surface or launching a child. */
	beforeLaunch?: (cwd: string, sessionPath?: string) => void;
	/** Details merged into acknowledgements and asynchronous result messages. */
	details?: Record<string, unknown>;
	/** Authoritative workflow sidecar metadata for this resume/rollover. */
	workflowMetadata?: LaunchProfileWorkflowMetadata;
	/** Exact fresh-rollover prompt when the caller owns manifest handoff text. */
	rolloverMessage?: string;
	onLaunched?: (input: {
		running: RunningSubagent;
		selection?: ModelSelection;
		userSelectedModel?: boolean;
		replacement: boolean;
		originalSessionPath: string;
		sessionPath: string;
	}) => void | Promise<void>;
	onResult?: (input: {
		result: SubagentResult;
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
	/** Workflow branch ownership; ordinary subagents have no branch restriction. */
	isOwned?: () => boolean;
	pi: ExtensionAPI;
	ctx: LaunchContext;
	running: RunningSubagent;
	pingAgent?: string;
	pingSessionPath?: string;
	onPing?: (
		input: { result: SubagentResult },
	) => Promise<void> | void;
	onSuccess: (
		input: { result: SubagentResult },
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
	onRolloverLaunched?(input: {
		running: RunningSubagent;
		rolloverProfile: LaunchProfile;
		params: SubagentResumeParams;
		recovery?: ResumeRecoveryContext;
	}): void | Promise<void>;
}
