import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { findLastAssistantMessage, findWorkflowCompletionMessage, getNewEntries } from "../sessions/session.ts";
import { summarizeSubagentUsage, type SubagentUsageSummary } from "../telemetry/usage.ts";
import type { createLifecycleServices } from "./lifecycle.ts";
import { copyClaudeSession, fallbackSummary, sendSubagentPing } from "./results.ts";
import type { BackgroundWatchOptions, RunningSubagent, SubagentResult, SubagentServiceDependencies } from "./types.ts";

export function createWatchServices(
	deps: SubagentServiceDependencies,
	lifecycle: Pick<ReturnType<typeof createLifecycleServices>, "captureSessionOwnership" | "closeSubagentSurface">,
) {
	const { captureSessionOwnership, closeSubagentSurface } = lifecycle;

	async function watchSubagent(
		running: RunningSubagent,
		signal: AbortSignal,
	): Promise<SubagentResult> {
		const { name, task, surface, startTime, sessionFile } = running;

		try {
			const result = await deps.pollForExit(
				surface,
				AbortSignal.any([signal, deps.getModuleAbortSignal()]),
				{
					interval: 1000,
					sessionFile,
					sentinelFile: running.sentinelFile,
					completionFile: running.completionFile,
					onTick() {
						deps.observeRunningSubagent(running);
					},
				},
			);

			const elapsed = Math.floor((Date.now() - startTime) / 1000);

			if (running.cli === "claude") {
				let summary = "";

				if (running.sentinelFile) {
					try {
						summary = readFileSync(running.sentinelFile, "utf-8").trim();
					} catch {
						// Screen capture is the fallback when the sentinel is unavailable.
					}
				}

				if (!summary) {
					summary = deps.readScreen(surface, 200).trimEnd();
				}

				const responded = Boolean(summary);
				if (!summary) {
					summary = result.exitCode === 0
						? "Claude Code exited without output"
						: `Claude Code exited with code ${result.exitCode}`;
				}

				let claudeSessionId: string | null = null;
				if (running.sentinelFile) {
					claudeSessionId = copyClaudeSession(running.sentinelFile);
					// Cleanup must not prevent the finished run from settling.
					try {
						unlinkSync(running.sentinelFile);
					} catch {
					}
					try {
						unlinkSync(running.sentinelFile + ".transcript");
					} catch {
					}
					try {
						unlinkSync(running.sentinelFile + ".launch");
					} catch {
					}
				}

				closeSubagentSurface(running);
				deps.runningSubagents.delete(running.id);

				return {
					name,
					task,
					summary,
					exitCode: result.exitCode,
					elapsed,
					responded,
					...(claudeSessionId ? { claudeSessionId } : {}),
				};
			}

			let summary: string;
			let usage: SubagentUsageSummary | undefined;
			let responded = false;
			let exitCode = result.exitCode;
			let errorMessage = result.errorMessage;
			if (existsSync(sessionFile)) {
				const allEntries = getNewEntries(sessionFile, 0);
				const currentEntries = allEntries.slice(running.executionStartLine ?? running.workflowSummaryStartLine ?? 0);
				const terminalAssistant = currentEntries.flatMap((entry) => {
					const message = entry.message as {
						role?: unknown; stopReason?: unknown; errorMessage?: unknown;
					} | undefined;
					return entry.type === "message" && message?.role === "assistant" ? [message] : [];
				}).at(-1);
				const failed = terminalAssistant?.stopReason === "error" || terminalAssistant?.stopReason === "aborted";
				if (failed) {
					if (exitCode === 0) exitCode = 1;
					errorMessage ??= (typeof terminalAssistant.errorMessage === "string" ? terminalAssistant.errorMessage.trim() : undefined)
						|| `Subagent exited with stopReason=${terminalAssistant.stopReason}.`;
				}
				const assistantMessage = result.reason === "done" && running.workflowSummaryStartLine !== undefined
					? findWorkflowCompletionMessage(currentEntries)
					: findLastAssistantMessage(currentEntries);
				responded = !failed && assistantMessage !== null;
				summary = assistantMessage ?? fallbackSummary({ exitCode, errorMessage });
				const aggregated = summarizeSubagentUsage(allEntries);
				if (aggregated.requests > 0) usage = aggregated;
			} else {
				summary = fallbackSummary(result);
			}

			closeSubagentSurface(running);
			deps.runningSubagents.delete(running.id);

			return {
				name,
				task,
				summary,
				sessionFile,
				exitCode,
				elapsed,
				responded,
				ping: result.ping,
				...(result.reason === "turn-limit" ? { turnLimit: true } : {}),
				...(usage ? { usage } : {}),
				...(errorMessage ? { errorMessage } : {}),
			};
		} catch (error) {
			try {
				closeSubagentSurface(running);
			} catch {
				// A failed close is not evidence the child stopped. Retain it so
				// callers (notably branch navigation) can retry a strict stop.
			}
			if (running.surfaceClosed) deps.runningSubagents.delete(running.id);

			const message = error instanceof Error ? error.message : String(error);
			if (signal.aborted) {
				return {
					name,
					task,
					summary: "Subagent cancelled.",
					exitCode: 1,
					elapsed: Math.floor((Date.now() - startTime) / 1000),
					error: "cancelled",
					sessionFile,
				};
			}
			return {
				name,
				task,
				summary: `Subagent error: ${message}`,
				exitCode: 1,
				elapsed: Math.floor((Date.now() - startTime) / 1000),
				error: message,
			};
		}
	}

	function watchInBackground(options: BackgroundWatchOptions): AbortController {
		const ownsSession = captureSessionOwnership(options.ctx);
		const isOwned = () => ownsSession() && options.isOwned?.() !== false;
		const deliver = (send: () => void): void => {
			if (!isOwned()) return;
			try {
				send();
			} catch {
				// The runtime can invalidate its API before shutdown reaches us.
				// Do not retry a failed notification through that same API.
			}
		};
		const watcherAbort = new AbortController();
		options.running.abortController = watcherAbort;
		deps.startWidgetRefresh();
		deps.startStatusRefresh(options.pi);

		void watchSubagent(options.running, watcherAbort.signal)
			.then(async (result) => {
				if (!isOwned()) return;
				deps.updateWidget();

				if (result.ping) {
					await options.onPing?.({ result });
					deliver(() => sendSubagentPing(
						options.pi,
						result,
						options.pingAgent,
						options.pingSessionPath,
					));
					return;
				}

				const presentation = await options.onSuccess({ result });
				deliver(() => options.pi.sendMessage(
					{
						customType: "subagent_result",
						content: presentation.content,
						display: true,
						details: presentation.details,
					},
					{ triggerTurn: true, deliverAs: "steer" },
				));
			})
			.catch(async (error) => {
				if (!isOwned()) return;
				deps.updateWidget();
				const message = error instanceof Error ? error.message : String(error);
				try {
					const presentation = await options.onError(message);
					deliver(() => options.pi.sendMessage(
						{
							customType: "subagent_result",
							content: presentation.content,
							display: true,
							details: presentation.details,
						},
						{ triggerTurn: true, deliverAs: "steer" },
					));
				} catch {
					deliver(() => options.pi.sendMessage(
						{
							customType: "subagent_result",
							content: `Sub-agent "${options.running.name}" error: ${message}`,
							display: true,
							details: { name: options.running.name, error: message },
						},
						{ triggerTurn: true, deliverAs: "steer" },
					));
				}
			})
			.catch(() => {
				// Detached watchers must also contain errors from ownership checks,
				// UI updates, and terminal error handling without using a stale API.
			});

		return watcherAbort;
	}

	return { watchSubagent, watchInBackground };
}
