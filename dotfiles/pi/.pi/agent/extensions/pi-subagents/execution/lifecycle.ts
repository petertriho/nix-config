import type { LaunchContext, RunningSubagent, SubagentServiceDependencies } from "./types.ts";

export function createLifecycleServices(
	deps: Pick<SubagentServiceDependencies, "getModuleAbortSignal" | "closeSurface" | "runningSubagents" | "updateWidget">,
) {
	function captureSessionOwnership(ctx: LaunchContext): () => boolean {
		// Keep the old signal: session_start installs a fresh, un-aborted one.
		const moduleSignal = deps.getModuleAbortSignal();
		const sessionId = ctx.sessionManager.getSessionId();
		return () => !moduleSignal.aborted
			&& deps.getModuleAbortSignal() === moduleSignal
			&& ctx.sessionManager.getSessionId() === sessionId;
	}

	function closeSubagentSurface(running: RunningSubagent): void {
		deps.closeSurface(running.surface);
		running.surfaceClosed = true;
	}

	function stopSubagent(running: RunningSubagent): void {
		// Do not forget a live child if tmux refuses the stop; navigation must fail.
		closeSubagentSurface(running);
		running.abortController?.abort();
		deps.runningSubagents.delete(running.id);
		deps.updateWidget();
	}

	function cleanupFailedPostLaunch(
		running: RunningSubagent,
		watcherAbort?: AbortController,
	): void {
		watcherAbort?.abort();
		try {
			closeSubagentSurface(running);
		} catch {
			// The watcher or child process may already have closed the surface.
		}
		if (running.surfaceClosed) deps.runningSubagents.delete(running.id);
		deps.updateWidget();
	}

	return { captureSessionOwnership, closeSubagentSurface, stopSubagent, cleanupFailedPostLaunch };
}
