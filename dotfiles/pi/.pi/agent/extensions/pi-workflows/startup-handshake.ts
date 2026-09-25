/** Bounded, load-order-independent registration gate for the future coordinator. */
import {
	discoverWorkflowProviders,
	type WorkflowEventBus,
	type WorkflowProvider,
} from "../workflow-provider/contract.ts";

export interface WorkflowStartupHandshakeOptions {
	readonly timeoutMs?: number;
	readonly env?: { readonly PI_SUBAGENT_ID?: string; readonly PI_SUBAGENT_SESSION?: string };
	/** The caller registers commands and tools only from this callback. */
	readonly register: (providers: readonly WorkflowProvider[]) => void;
	/** Wire to ctx.ui.notify; no workflow command exists on failure. */
	readonly notify: (message: string) => void;
}

/**
 * Repeated discovery probes let the provider attach before or after this
 * extension's session_start. Never register from a partial/late result.
 * One gate belongs to one extension/session binding; shutdown invalidates it.
 */
export function createWorkflowStartupHandshake(
	events: WorkflowEventBus,
	options: WorkflowStartupHandshakeOptions,
): { start(): Promise<void>; shutdown(): void } {
	let stopped = false;
	let registered = false;
	let pending: Promise<void> | null = null;
	const controller = new AbortController();

	return {
		start(): Promise<void> {
			if (stopped || registered || options.env?.PI_SUBAGENT_ID || options.env?.PI_SUBAGENT_SESSION) {
				return Promise.resolve();
			}
			if (pending) return pending;
			const attempt = (async () => {
				try {
					const providers = await discoverWorkflowProviders(events, {
						timeoutMs: options.timeoutMs,
						signal: controller.signal,
					});
					if (stopped) return;
					if (providers.length === 0) {
						options.notify("Workflows disabled: no compatible workflow execution provider responded at startup.");
						return;
					}
					options.register(providers);
					registered = true;
				} catch (error) {
					if (!stopped) {
						options.notify(`Workflows disabled: provider startup failed: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
			})().finally(() => {
				if (pending === attempt) pending = null;
			});
			pending = attempt;
			return attempt;
		},
		shutdown(): void {
			stopped = true;
			controller.abort();
		},
	};
}
