/** Adapt legacy service results at the active tool boundary, not notice callbacks. */
export function activeAgentResult<T extends { details: unknown; isError?: boolean }>(result: T): T {
  const details = result.details as { error?: unknown; exitCode?: number } | undefined;
  return details?.error != null || (details?.exitCode != null && details.exitCode !== 0)
    ? { ...result, isError: true }
    : result;
}
