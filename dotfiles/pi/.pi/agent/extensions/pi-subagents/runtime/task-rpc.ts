import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findLastAssistantMessage, getNewEntries } from "../sessions/session.ts";
import {
  attachTaskRpc, resolveTaskAgentProfile, resolveTaskLaunchModel,
  type AttachedTaskRpc, type NormalizedTaskSpawnOptions, type TaskAgentProfileDirs,
  type TaskRunHandle, type TaskRpcRuntimeHooks, type TaskSpawnSpec,
} from "../tasks/rpc.ts";
import type { LaunchContext } from "../execution/services.ts";
import { closeSurface, sendEscape } from "../adapters/tmux.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { SubagentRuntime } from "./refresh.ts";
import type { ExecutionRuntime } from "./execution.ts";

export function createTaskRpcAdapter(discovery: AgentDiscovery, runtime: SubagentRuntime, execution: ExecutionRuntime) {
  const { getAgentConfigDir, getBundledAgentsDir } = discovery;
  const { runningSubagents, startWidgetRefresh, startStatusRefresh } = runtime;
  const { launchSubagent, watchSubagent } = execution;
  let attachedTaskRpc: AttachedTaskRpc | null = null;
  let taskRpcAttachInFlight: Promise<void> | null = null;
  let taskRpcAttachEpoch = 0;

  function getTaskAgentProfileDirs(): TaskAgentProfileDirs {
    return {
      project: join(process.cwd(), ".pi", "agents"),
      global: join(getAgentConfigDir(), "agents"),
      bundled: getBundledAgentsDir(),
    };
  }

  function readTaskPartialResult(handle: TaskRunHandle): string | undefined {
    try {
      if (!existsSync(handle.sessionFile)) return undefined;
      return findLastAssistantMessage(getNewEntries(handle.sessionFile, 0)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  function createTaskRpcRuntimeHooks(
    pi: ExtensionAPI,
    ctx: LaunchContext,
  ): TaskRpcRuntimeHooks {
    return {
      async launch(spec: TaskSpawnSpec): Promise<TaskRunHandle> {
        // RPC task launches force autonomous behavior through taskRuntime
        // (interactive: false, autoExit: true, optional PI_SUBAGENT_MAX_TURNS).
        const running = await launchSubagent(
          {
            name: spec.options.description ?? spec.profile.fileName,
            task: spec.prompt,
            agent: spec.profile.fileName,
          },
          ctx,
          {
            resolvedModel: spec.resolvedModel,
            taskRuntime: {
              ...(spec.options.maxTurns == null ? {} : { maxTurns: spec.options.maxTurns }),
            },
          },
        );
        const watcherAbort = new AbortController();
        running.abortController = watcherAbort;
        startWidgetRefresh();
        startStatusRefresh(pi);
        return {
          id: running.id,
          surface: running.surface,
          sessionFile: running.sessionFile,
          abortController: watcherAbort,
        };
      },
      watch(handle: TaskRunHandle, signal: AbortSignal) {
        const running = runningSubagents.get(handle.id);
        if (!running) {
          // The pane record vanished (e.g. a shutdown raced the deferred watch).
          return Promise.resolve({
            exitCode: 1,
            summary: "Task agent pane record was lost before watching started.",
            responded: false,
          });
        }
        return watchSubagent(running, signal);
      },
      sendEscape(handle: TaskRunHandle): void {
        sendEscape(handle.surface);
      },
      closeSurface(handle: TaskRunHandle): void {
        closeSurface(handle.surface);
        // Contain late launches: when the bridge closes a surface whose watcher
        // never started (shutdown raced the pane creation), the running entry
        // was added after the shutdown clear and must be dropped here. Normal
        // completion paths already deleted it — a second delete is a no-op.
        runningSubagents.delete(handle.id);
      },
      readPartialResult: readTaskPartialResult,
    };
  }

  async function resolveAndLaunchTaskRpc(
    pi: ExtensionAPI,
    ctx: LaunchContext,
    request: { type: string; prompt: string; options: NormalizedTaskSpawnOptions },
  ): Promise<{ spec: TaskSpawnSpec; handle: TaskRunHandle }> {
    const resolution = resolveTaskAgentProfile(request.type, getTaskAgentProfileDirs());
    if (!resolution.ok) throw new Error(resolution.error);
    const resolvedModel = resolveTaskLaunchModel({
      ...(request.options.model ? { override: request.options.model } : {}),
      profile: resolution.profile,
      ctx: {
        modelRegistry: ctx.modelRegistry ?? { getAvailable: () => [] },
        ...(ctx.model ? { parentModel: ctx.model } : {}),
        agentDir: getAgentConfigDir(),
      },
    });
    const spec: TaskSpawnSpec = {
      type: request.type,
      prompt: request.prompt,
      options: request.options,
      profile: resolution.profile,
      resolvedModel,
    };
    const handle = await createTaskRpcRuntimeHooks(pi, ctx).launch(spec);
    return { spec, handle };
  }

  /**
   * Register the protocol-v2 task RPC handlers on the root session (or abstain
   * when the original pi-subagents owns the channels). Idempotent per session;
   * /new, /resume, and /fork re-attach after their session_shutdown tore down.
   */
  async function attachPiTasksRpcBridge(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
    if (attachedTaskRpc || taskRpcAttachInFlight) return;
    // Session generation: shutdown bumps it, invalidating any attach that is
    // still awaiting its bounded provider probe.
    const epoch = taskRpcAttachEpoch;
    const attempt = (async () => {
      const launchContext: LaunchContext = { ...ctx, pi };
      const attached = await attachTaskRpc({
        events: pi.events,
        hooks: createTaskRpcRuntimeHooks(pi, launchContext),
        resolveAndLaunch: (request) => resolveAndLaunchTaskRpc(pi, launchContext, request),
        notify: (message) => {
          ctx.ui.notify(message, "info");
        },
      });
      if (epoch !== taskRpcAttachEpoch) {
        // A shutdown completed while the provider probe was in flight. The
        // late registration binds a stale context: tear it down immediately
        // instead of letting it answer the next session's requests.
        if (attached) {
          attached.bridge.shutdown();
          attached.detach();
        }
        return;
      }
      if (attached) attachedTaskRpc = attached;
    })().finally(() => {
      // Clear only this attempt's marker. A shutdown-voided attempt can settle
      // after a newer attach is already in flight; unconditionally nulling here
      // would erase that attempt's marker and admit a third concurrent attach,
      // whose registration would duplicate the live handler set.
      if (taskRpcAttachInFlight === attempt) taskRpcAttachInFlight = null;
    });
    taskRpcAttachInFlight = attempt;
    await attempt;
  }

  function shutdownPiTasksRpcBridge(): void {
    // Invalidate any in-flight attach first so its post-probe epoch check
    // discards the late registration.
    taskRpcAttachEpoch++;
    if (attachedTaskRpc) {
      attachedTaskRpc.bridge.shutdown();
      attachedTaskRpc.detach();
      attachedTaskRpc = null;
    }
    taskRpcAttachInFlight = null;
  }

  function getAttachedTaskRpcForTests(): AttachedTaskRpc | null {
    return attachedTaskRpc;
  }

  function resetTaskRpcForTests(): void {
    shutdownPiTasksRpcBridge();
  }
  return { attachPiTasksRpcBridge, shutdownPiTasksRpcBridge,
    getAttachedTaskRpcForTests, resetTaskRpcForTests, getTaskAgentProfileDirs,
    createTaskRpcRuntimeHooks, resolveAndLaunchTaskRpc, readTaskPartialResult };
}
export type TaskRpcAdapter = ReturnType<typeof createTaskRpcAdapter>;
