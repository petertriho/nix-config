import type { ProviderFailureRecord } from "./launch-profile.ts";

export type ProviderFailureKind = "usage" | "retry-exhausted" | "other";

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

/** Quota/usage exhaustion takes precedence over transient failures. */
export function classifyProviderFailure(message: string): ProviderFailureKind {
	const text = message.trim();
	if (!text) return "other";
	if (USAGE_FAILURE_PATTERNS.some((pattern) => pattern.test(text))) return "usage";
	if (TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(text))) return "retry-exhausted";
	return "other";
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
			/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|credential|authorization)\b(["']?)(\s*[:=]\s*)("(?:\\[\s\S]|[^"\\])+(?:"|\\?$)|'(?:\\[\s\S]|[^'\\])+(?:'|\\?$)|[^\s"',;]+)/gi,
			(_match, key: string, keyQuote: string, separator: string, value: string) => {
				const valueQuote = value[0] === "\"" || value[0] === "'" ? value[0] : "";
				const quote = valueQuote || keyQuote;
				const suffix = keyQuote && !valueQuote ? value.match(/[}\]]+$/)?.[0] ?? "" : "";
				return `${key}${keyQuote}${separator}${quote}[REDACTED]${quote}${suffix}`;
			},
		)
		.replace(/([?&](?:api[_-]?key|token|access[_-]?token|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]")
		.replace(/(https?:\/\/)[^@\s/]+@/gi, "$1[REDACTED]@")
		.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
		.replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED]")
		.replace(
			/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
			"[REDACTED]",
		);
	// Redaction markers can expand short credential values beyond the input cap.
	return redacted.slice(0, 2_000) || "provider failure details unavailable";
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
