import type { SavedContextEstimate } from "./context-fit.ts";
import type {
	ModelSelection,
	ProviderFailureRecord,
	WorkflowPhase,
} from "./launch-profile.ts";

/**
 * Workflow provider-failure recovery (T6).
 *
 * Classifies provider/agent failures surfaced by a workflow child, decides
 * whether the recovery user gate applies, and formats the gate summary.
 *
 * Classification only observes the final error that reached the parent:
 * transient network, overload, and rate-limit failures retry inside the child
 * session through Pi's normal retry policy, so they surface here only after
 * those retries are exhausted. This module never retries, never falls back to
 * another provider automatically, and knows nothing about provider-specific
 * cache or affinity parameters.
 */

export type ProviderFailureKind = ProviderFailureRecord["kind"];

/**
 * Quota/usage-exhaustion markers. These failures are not transient: the
 * account ran out of quota, credits, or spend allowance and retrying cannot
 * succeed until the limit resets or is raised.
 */
const USAGE_FAILURE_PATTERNS: readonly RegExp[] = [
	/\bquota\b/i,
	/\busage[ _-]?limit/i,
	/\bcredit/i,
	/\bbilling\b/i,
	/\bspend(ing)? limit/i,
	/\bprepaid\b/i,
	/\bmonthly limit\b/i,
	/\bdaily limit\b/i,
	/insufficient[_ -]?funds/i,
	/purchase (more )?(credits?|a plan)/i,
	/\bplan limit\b/i,
];

/**
 * Transient failure markers. When one of these reaches the parent, the
 * child's normal retries are already exhausted.
 */
const TRANSIENT_FAILURE_PATTERNS: readonly RegExp[] = [
	/\bretr(y|ies|ying)\b[^\n]*\b(exhaust|exceeded|failed|gave up|stopped)/i,
	/\b(exhaust|gave up|stopped)\b[^\n]*\bretr(y|ies|ying)\b/i,
	/\boverload/i,
	/\brate[ _-]?limit/i,
	/\btimeout\b|\btimed out\b|etimedout/i,
	/\bconnection\b.*\b(error|reset|refused|closed|lost)\b/i,
	/econnreset|econnrefused|enotfound|epipe/i,
	/\bnetwork\b/i,
	/\btemporar(ily|y)\b/i,
	/\btry again\b/i,
	/\bserver error\b|\binternal server\b|service unavailable|\bapi[ _-]?error\b/i,
	/\b(500|502|503|504|529|429)\b/,
];

const FAILURE_KIND_LABELS: Record<ProviderFailureKind, string> = {
	usage: "quota/usage exhaustion",
	"retry-exhausted": "transient failures exhausted normal retries",
	other: "provider/agent error",
};

export const WORKFLOW_PHASE_LABELS: Record<WorkflowPhase, string> = {
	planner: "planner",
	"task-writer": "task writer",
	implementer: "implementer",
	reviewer: "reviewer",
};

/** Recovery gate choices shown after the failure summary. */
export const RECOVERY_SELECT_MODEL = "Select a replacement model and thinking level";
export const RECOVERY_STOP = "Stop recovery";

/**
 * Classify a provider/agent error message that reached the parent.
 * Usage-exhaustion markers win over transient wording; an unrecognized
 * failure is `other`, which keeps the existing report-and-ask behavior
 * instead of a model-switch gate.
 */
export function classifyProviderFailure(message: string): ProviderFailureKind {
	const text = message.trim();
	if (!text) return "other";
	if (USAGE_FAILURE_PATTERNS.some((pattern) => pattern.test(text))) return "usage";
	if (TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(text))) return "retry-exhausted";
	return "other";
}

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

export function formatRecoverySummary(input: {
	phase: WorkflowPhase;
	failureKind: ProviderFailureKind;
	failure: string;
	sessionPath: string;
	provider?: string;
	model?: string;
	estimate?: SavedContextEstimate;
}): string {
	const providerModel = input.provider && input.model
		? `${input.provider}/${input.model}`
		: "unknown";
	const estimate = input.estimate
		? `${input.estimate.tokens.toLocaleString()} tokens (${input.estimate.source})`
		: "unavailable";
	return [
		`Workflow ${WORKFLOW_PHASE_LABELS[input.phase]} phase failed — ${formatFailureKind(input.failureKind)}.`,
		`Provider/model: ${providerModel}`,
		`Saved session: ${input.sessionPath}`,
		`Context estimate: ${estimate}`,
		`Failure: ${input.failure}`,
		"The saved session and all completed artifacts are preserved.",
	].join("\n");
}

/** Default continuation message for a recovered workflow role session. */
export function defaultRecoveryMessage(): string {
	return (
		"A provider failure interrupted this workflow phase. Do not redo completed work. "
		+ "Re-read your phase artifacts, continue from where this session stopped, and finish the phase."
	);
}
