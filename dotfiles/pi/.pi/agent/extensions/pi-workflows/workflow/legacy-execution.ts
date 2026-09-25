import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LaunchProfileWorkflowMetadata, ModelSelection, ProviderFailureRecord } from "../../workflow-provider/launch-profile.ts";
import type { ResolvedModelSelection } from "../../workflow-provider/model-picker.ts";

// Structural compatibility for the existing in-process execution path. These
// types do not load the tmux extension; the event path uses WorkflowEventClient.
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
export interface SubagentToolResult {
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
}
export interface SubagentUsageSummary {
	requests: number;
	input?: number; output?: number; total?: number;
	contextTokens?: number; contextWindow?: number; contextRatio?: number;
	provider?: string; model?: string; thinking?: string;
	cacheRead?: number; cacheWrite?: number; skippedInvalidUsage: number;
}
export interface SubagentResult {
	name: string; task: string; summary: string;
	sessionFile?: string; claudeSessionId?: string;
	exitCode: number; elapsed: number;
	error?: string; errorMessage?: string; turnLimit?: boolean;
	usage?: SubagentUsageSummary; responded?: boolean;
	ping?: { name: string; message: string };
}
export interface RunningSubagent {
	id: string; name: string; task: string; agent?: string;
	surface: string; startTime: number; sessionFile: string;
	launchScriptFile?: string; activityFile?: string;
	activity?: any; activityRead?: { ok: boolean; reason?: "missing" | "invalid" | "wrong-id"; error?: string };
	abortController?: AbortController; surfaceClosed?: boolean;
	cli?: string; sentinelFile?: string;
	statusState: any; interactive: boolean; boundary?: unknown;
}
export interface SubagentLaunchParams {
	name: string; task: string; agent?: string; systemPrompt?: string;
	model?: string; skills?: string; tools?: string; cwd?: string;
	fork?: boolean; interactive?: boolean; resumeSessionId?: string;
}
export interface AgentDefaultsLike {
	model?: string; tools?: string; skills?: string; thinking?: string;
	denyTools?: string; spawning?: boolean; autoExit?: boolean;
	interactive?: boolean; systemPromptMode?: "append" | "replace";
	sessionMode?: "standalone" | "lineage-only" | "fork";
	cwd?: string; cli?: string; body?: string; disableModelInvocation?: boolean;
}
export interface SubagentResumeParams {
	sessionPath: string; name?: string; message?: string; autoExit?: boolean; model?: string;
}
export interface ResumeRecoveryContext {
	failure: ProviderFailureRecord;
	details?: Record<string, unknown>;
	pickerTitle?: string; pickerSubject?: string;
	transformWorkflowMetadata?: (workflow: LaunchProfileWorkflowMetadata, selection: ResolvedModelSelection) => LaunchProfileWorkflowMetadata;
	onSuccessfulResponse?: (selection: ModelSelection) => void | Promise<void>;
}
export interface PhaseBoundaryOutcome {
	details: Record<string, unknown>; violationText?: string;
}
export interface ResumeLifecycleContext {
	isOwned?: () => boolean;
	details?: Record<string, unknown>;
	workflowMetadata?: LaunchProfileWorkflowMetadata;
	boundary?: unknown; rolloverMessage?: string;
	onLaunched?: (input: { running: RunningSubagent; replacement: boolean; originalSessionPath: string; sessionPath: string }) => void | Promise<void>;
	onResult?: (input: { result: SubagentResult; boundary?: PhaseBoundaryOutcome; replacement: boolean; originalSessionPath: string; sessionPath: string }) => void | Promise<void>;
	onError?: (input: { message: string; replacement: boolean; originalSessionPath: string; sessionPath: string }) => void | Promise<void>;
}
export interface BackgroundWatchOptions {
	isOwned?: () => boolean;
	pi: ExtensionAPI; ctx: LaunchContext; running: RunningSubagent;
	pingAgent?: string; pingSessionPath?: string;
	onPing?: (input: { result: SubagentResult; boundary?: PhaseBoundaryOutcome }) => Promise<void> | void;
	onSuccess: (input: { result: SubagentResult; boundary?: PhaseBoundaryOutcome }) =>
		Promise<{ content: string; details: Record<string, unknown> }> | { content: string; details: Record<string, unknown> };
	onError: (message: string) =>
		Promise<{ content: string; details: Record<string, unknown> }> | { content: string; details: Record<string, unknown> };
}

export function resolveUsageDetails(result: Pick<SubagentResult, "usage">, ctx: LaunchContext): SubagentUsageSummary | undefined {
	const usage = result.usage;
	if (!usage) return undefined;
	const model = ctx.modelRegistry?.getAvailable().find((candidate) =>
		candidate.provider === usage.provider && candidate.id === usage.model);
	const window = model?.contextWindow;
	return window && window > 0 && usage.contextTokens !== undefined
		? { ...usage, contextWindow: window, contextRatio: usage.contextTokens / window }
		: usage;
}

function formatUsage(usage: SubagentUsageSummary | undefined): string | undefined {
	if (!usage || usage.requests <= 0) return undefined;
	const count = (value: number) => value.toLocaleString("en-US");
	const parts = [`${usage.requests} ${usage.requests === 1 ? "request" : "requests"}`];
	if (usage.input !== undefined) parts.push(`input ${count(usage.input)}`);
	if (usage.output !== undefined) parts.push(`output ${count(usage.output)}`);
	if (usage.total !== undefined) parts.push(`total ${count(usage.total)}`);
	if (usage.contextTokens !== undefined) {
		if (usage.contextWindow === undefined) parts.push(`context ${count(usage.contextTokens)}`);
		else {
			const size = usage.contextWindow >= 1_000_000
				? `${Number.isInteger(usage.contextWindow / 1_000_000) ? (usage.contextWindow / 1_000_000).toFixed(0) : (usage.contextWindow / 1_000_000).toFixed(1)}m`
				: `${Math.max(1, Math.round(usage.contextWindow / 1_000))}k`;
			parts.push(`context ${count(usage.contextTokens)}/${size} (${Math.round((usage.contextRatio ?? usage.contextTokens / usage.contextWindow) * 100)}%)`);
		}
	}
	if (usage.cacheRead !== undefined) parts.push(`cache read ${count(usage.cacheRead)}`);
	if (usage.cacheWrite !== undefined) parts.push(`cache write ${count(usage.cacheWrite)}`);
	const identity = [usage.provider, usage.model].filter(Boolean).join("/");
	if (identity) parts.push(identity);
	if (usage.thinking) parts.push(`thinking ${usage.thinking}`);
	return `Usage: ${parts.join(" · ")}`;
}

export function resolveResultPresentation(result: Pick<SubagentResult, "exitCode" | "elapsed" | "summary" | "sessionFile" | "errorMessage" | "usage">, name: string): string {
	const minutes = Math.floor(result.elapsed / 60);
	const seconds = result.elapsed % 60;
	const elapsed = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
	const session = result.sessionFile ? `\n\nSession: ${result.sessionFile}\nResume: pi --session ${result.sessionFile}` : "";
	const formatted = formatUsage(result.usage);
	const usage = formatted ? `\n\n${formatted}` : "";
	if (result.errorMessage) return `Sub-agent "${name}" failed after ${elapsed} (provider/agent error — auto-retry exhausted).\n\n`
		+ `Error: ${result.errorMessage}\n\nThe subagent did not produce a result. You can retry by spawning a new `
		+ `subagent or resume the session with subagent_resume.${usage}${session}`;
	return result.exitCode === 0
		? `Sub-agent "${name}" completed (${elapsed}).\n\n${result.summary}${usage}${session}`
		: `Sub-agent "${name}" failed (exit code ${result.exitCode}).\n\n${result.summary}${usage}${session}`;
}
