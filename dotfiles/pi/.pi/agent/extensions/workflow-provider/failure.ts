/** Provider error classification shared by ordinary agents and workflow recovery. */
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
