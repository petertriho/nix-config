import { realpathSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { LaunchContext, RunningSubagent, SubagentServiceDependencies } from "./types.ts";

const sessionReservations = new WeakMap<Map<string, RunningSubagent>, Set<string>>();

export function createLifecycleServices(
	deps: Pick<SubagentServiceDependencies, "getModuleAbortSignal" | "closeSurface" | "runningSubagents" | "updateWidget">,
) {
	const reservations = sessionReservations.get(deps.runningSubagents) ?? new Set<string>();
	sessionReservations.set(deps.runningSubagents, reservations);

	function reserveSavedSession(sessionPath: string): () => void {
		const canonicalPath = realpathSync(sessionPath);
		const live = [...deps.runningSubagents.values()].some((running) => {
			if (running.surfaceClosed) return false;
			try {
				return realpathSync(running.sessionFile) === canonicalPath;
			} catch {
				return resolve(running.sessionFile) === canonicalPath;
			}
		});
		if (reservations.has(canonicalPath) || live) {
			throw new Error(`Saved session is already owned by a pending or running subagent: ${canonicalPath}`);
		}
		reservations.add(canonicalPath);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			reservations.delete(canonicalPath);
		};
	}

	function captureSessionOwnership(ctx: LaunchContext): () => boolean {
		// Keep the old signal: session_start installs a fresh, un-aborted one.
		const moduleSignal = deps.getModuleAbortSignal();
		const sessionId = ctx.sessionManager.getSessionId();
		return () => !moduleSignal.aborted
			&& deps.getModuleAbortSignal() === moduleSignal
			&& ctx.sessionManager.getSessionId() === sessionId;
	}

	function closeSubagentSurface(running: RunningSubagent): void {
		if (running.surfaceClosed) return;
		deps.closeSurface(running.surface);
		running.surfaceClosed = true;
		running.releaseSession?.();
		if (running.completionFile) {
			try { rmSync(running.completionFile, { force: true }); } catch {
				// A unique transient status file cannot affect a later execution.
			}
		}
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

	return { reserveSavedSession, captureSessionOwnership, closeSubagentSurface, stopSubagent, cleanupFailedPostLaunch };
}
