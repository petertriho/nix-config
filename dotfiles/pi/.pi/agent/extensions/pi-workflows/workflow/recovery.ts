import type {
	ModelSelection,
	ProviderFailureRecord,
} from "../../workflow-provider/launch-profile.ts";
import { classifyProviderFailure, type ProviderFailureKind } from "../../workflow-provider/failure.ts";
import {
	overrideWorkflowRunAssignment,
	assertWorkflowRoleEnabled,
	type WorkflowRunState,
	type WorkflowRunTransitionOptions,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import {
	buildWorkflowRoleContinuation,
	resolveWorkflowRole,
} from "./handoff.ts";
import type { WorkflowRunSnapshot } from "./types.ts";

type RecoveryContextEstimate = {
	readonly tokens: number;
	readonly usageTokens: number;
	readonly trailingTokens: number;
	readonly source: "usage+estimate" | "conservative";
};

/**
 * Workflow provider-failure recovery helpers.
 *
 * These helpers are manifest-driven: they classify provider failures
 * generically, then derive recovery UI labels, summaries, and continuation
 * messages from the current workflow role snapshot rather than from fixed role
 * or phase names.
 */

export { classifyProviderFailure };
export type { ProviderFailureKind };

const FAILURE_KIND_LABELS: Record<ProviderFailureKind, string> = {
	usage: "quota/usage exhaustion",
	"retry-exhausted": "transient failures exhausted normal retries",
	other: "provider/agent error",
};

/** Recovery gate choices shown after the failure summary. */
export const RECOVERY_SELECT_MODEL = "Select a replacement model and thinking level";
export const RECOVERY_STOP = "Stop recovery";

export interface WorkflowRecoveryTextLabels {
	readonly roleLabel: string;
	readonly pickerSubject: string;
	readonly pickerTitle: string;
	readonly gatePrompt: string;
}

export interface WorkflowRecoveryLabels extends WorkflowRecoveryTextLabels {
	readonly roleId: string;
	readonly sessionPath?: string;
}

function resolveWorkflowRecoveryRoleId(
	snapshot: WorkflowRunSnapshot,
	roleId?: string,
): string {
	const resolvedRoleId = roleId ?? snapshot.activeLaunch?.roleId;
	if (!resolvedRoleId) {
		throw new Error(
			`Workflow run "${snapshot.runId}" has no active role for provider recovery.`,
		);
	}
	resolveWorkflowRole(snapshot.definition, resolvedRoleId);
	assertWorkflowRoleEnabled(snapshot, resolvedRoleId);
	return resolvedRoleId;
}

/**
 * Classify a provider/agent error message that reached the parent.
 * Usage-exhaustion markers win over transient wording; an unrecognized
 * failure is `other`, which keeps the existing report-and-ask behavior
 * instead of a model-switch gate.
 */
export function formatFailureKind(kind: ProviderFailureKind): string {
	return FAILURE_KIND_LABELS[kind];
}

/** Whether the failure kind opens the workflow recovery user gate. */
export function shouldOpenRecoveryGate(kind: ProviderFailureKind): boolean {
	return kind === "usage" || kind === "retry-exhausted";
}

/**
 * Keep failure diagnostics useful without writing credentials or full
 * provider payloads to the launch-profile sidecar.
 */
export function redactProviderFailureMessage(message: string): string {
	let redacted = message.trim().slice(0, 2_000);
	redacted = redacted
		.replace(
			/\b(authorization\s*:\s*)(?:bearer|basic)\s+[^\s,;]+/gi,
			"$1[REDACTED]",
		)
		.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]")
		.replace(
			/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|credential)\b(\s*[:=]\s*)(["']?)[^\s"',;]+/gi,
			"$1$2$3[REDACTED]",
		)
		.replace(/([?&](?:api[_-]?key|token|access[_-]?token|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]")
		.replace(/(https?:\/\/)[^@\s/]+@/gi, "$1[REDACTED]@")
		.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
		.replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED]")
		.replace(
			/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
			"[REDACTED]",
		);
	return redacted || "provider failure details unavailable";
}

export function buildProviderFailureRecord(input: {
	kind: ProviderFailureKind;
	message: string;
	provider?: string;
	model?: string;
	recordedAt?: Date;
}): ProviderFailureRecord {
	return {
		kind: input.kind,
		message: redactProviderFailureMessage(input.message),
		...(input.provider ? { provider: input.provider } : {}),
		...(input.model ? { model: input.model } : {}),
		recordedAt: (input.recordedAt ?? new Date()).toISOString(),
	};
}

export function formatModelSelection(selection: ModelSelection | undefined): string {
	if (!selection?.provider || !selection.model) return "unknown";
	return selection.thinking
		? `${selection.provider}/${selection.model}:${selection.thinking}`
		: `${selection.provider}/${selection.model}`;
}

export function buildWorkflowRecoveryTextLabels(
	roleLabel: string,
): WorkflowRecoveryTextLabels {
	return {
		roleLabel,
		pickerSubject: `${roleLabel} recovery`,
		pickerTitle: `Resume model for ${roleLabel} recovery`,
		gatePrompt: `Recover the ${roleLabel} role?`,
	};
}

export function resolveWorkflowRecoverySessionPath(
	snapshot: WorkflowRunSnapshot,
	roleId?: string,
): string | undefined {
	const resolvedRoleId = resolveWorkflowRecoveryRoleId(snapshot, roleId);
	return snapshot.roleSessions[resolvedRoleId]?.current
		?? (snapshot.activeLaunch?.roleId === resolvedRoleId
			? snapshot.activeLaunch.sessionPath
			: undefined);
}

export function buildWorkflowRecoveryLabels(
	snapshot: WorkflowRunSnapshot,
	roleId?: string,
): WorkflowRecoveryLabels {
	const resolvedRoleId = resolveWorkflowRecoveryRoleId(snapshot, roleId);
	const role = resolveWorkflowRole(snapshot.definition, resolvedRoleId);
	return {
		roleId: resolvedRoleId,
		...buildWorkflowRecoveryTextLabels(role.label),
		...(resolveWorkflowRecoverySessionPath(snapshot, resolvedRoleId)
			? { sessionPath: resolveWorkflowRecoverySessionPath(snapshot, resolvedRoleId) }
			: {}),
	};
}

export function formatWorkflowRecoverySummaryForRoleLabel(input: {
	roleLabel: string;
	failureKind: ProviderFailureKind;
	failure: string;
	sessionPath?: string;
	provider?: string;
	model?: string;
	estimate?: RecoveryContextEstimate;
}): string {
	const providerModel = input.provider && input.model
		? `${input.provider}/${input.model}`
		: "unknown";
	const estimate = input.estimate
		? `${input.estimate.tokens.toLocaleString()} tokens (${input.estimate.source})`
		: "unavailable";
	return [
		`Workflow ${input.roleLabel} failed — ${formatFailureKind(input.failureKind)}.`,
		`Provider/model: ${providerModel}`,
		`Saved session: ${input.sessionPath ?? "unavailable"}`,
		`Context estimate: ${estimate}`,
		`Failure: ${input.failure}`,
		"The saved session and all completed workflow data are preserved.",
	].join("\n");
}

export function formatWorkflowRecoverySummary(input: {
	snapshot: WorkflowRunSnapshot;
	roleId?: string;
	failureKind: ProviderFailureKind;
	failure: string;
	sessionPath?: string;
	provider?: string;
	model?: string;
	estimate?: RecoveryContextEstimate;
}): string {
	const labels = buildWorkflowRecoveryLabels(input.snapshot, input.roleId);
	return formatWorkflowRecoverySummaryForRoleLabel({
		roleLabel: `${labels.roleLabel} role`,
		failureKind: input.failureKind,
		failure: input.failure,
		sessionPath: input.sessionPath ?? labels.sessionPath,
		...(input.provider ? { provider: input.provider } : {}),
		...(input.model ? { model: input.model } : {}),
		...(input.estimate ? { estimate: input.estimate } : {}),
	});
}

/** Default continuation message for a recovered workflow role session. */
export function defaultWorkflowRecoveryMessage(
	subject = "workflow role",
): string {
	return (
		`A provider failure interrupted the ${subject}. Do not redo completed work. `
		+ "Re-read the saved workflow data, continue from where this session stopped, and finish the pending work."
	);
}

export function buildWorkflowRecoveryMessage(input: {
	readonly snapshot: WorkflowRunSnapshot;
	readonly roleId?: string;
	readonly userMessage?: string;
}): string {
	const labels = buildWorkflowRecoveryLabels(input.snapshot, input.roleId);
	const role = resolveWorkflowRole(input.snapshot.definition, labels.roleId);
	return buildWorkflowRoleContinuation({
		opening: defaultWorkflowRecoveryMessage(`${labels.roleLabel} role`),
		role,
		dataSlots: input.snapshot.definition.data,
		data: input.snapshot.data,
		...(input.userMessage ? { userMessage: input.userMessage } : {}),
	});
}

export function applyWorkflowRunRecoveryOverride(
	state: WorkflowRunState,
	runId: string,
	roleId: string,
	selection: ModelSelection,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	return overrideWorkflowRunAssignment(state, runId, roleId, selection, options);
}
