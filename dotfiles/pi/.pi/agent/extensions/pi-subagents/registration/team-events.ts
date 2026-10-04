import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkLeadAdmission } from "../teams/admission.ts";
import { LEGACY_NATIVE_TASK_HOLD } from "../teams/transport.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { TeamRuntime } from "../runtime/teams.ts";

export function registerTeamEvents(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  team: TeamRuntime,
  shouldRegister: (name: string) => boolean
): void {
  const { getAgentConfigDir } = discovery;
  const { memberMailbox, capturedPiTasks, leadRecoveries,
    existingCoordinator, stopTeamMember, invalidateApprovals } = team;
  if (!memberMailbox && shouldRegister("TeamStop"))
    pi.registerTool({
      name: "TeamStop",
      label: "Stop Teammate",
      exposure: "direct",
      description: "Fully stop an active teammate owned by this lead session. " +
        'Use task_id: "team:<member UUID>". AgentInterrupt stops only the current turn; TaskStop is for native tasks.',
      parameters: Type.Object({
        task_id: Type.String({ description: "Qualified teammate ID: team:<member UUID>" }),
      }),
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        try {
          if (!/^team:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.task_id)) {
            throw new Error('Use a qualified teammate ID: "team:<member UUID>"');
          }
          const text = await stopTeamMember(ctx, params.task_id.slice("team:".length), signal);
          return {
            isError: false,
            content: [{ type: "text" as const, text }],
            details: { teamStop: true },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Teammate stop refused: ${message}` }],
            details: { teamStop: true, error: message },
          };
        }
      },
    });
  pi.on("tool_call", async (event, ctx) => {
    if (!memberMailbox && event.toolName === "TaskCreate" && team.coordinator) {
      const disk = checkLeadAdmission({
        cwd: ctx.cwd, agentDir: getAgentConfigDir(),
        sessionId: ctx.sessionManager.getSessionId(),
        sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
        piTasks: capturedPiTasks,
      }, team.leadReceipt);
      if (disk.ok && disk.value.tasks.length > 0 &&
          disk.value.tasks.every((task) => task.status === "completed")) {
        leadRecoveries.set(event.toolCallId, {
          storeFingerprint: disk.value.storeFingerprint,
          completed: disk.value.tasks.map((task) => ({
            id: task.id, blocks: [...task.blocks], blockedBy: [...task.blockedBy],
          })),
        });
      }
    }
    if (event.toolName !== "TaskStop") return;
    const args = event.input as { task_id?: unknown; shell_id?: unknown };
    const taskId = args.task_id ?? args.shell_id;
    if (typeof taskId !== "string" || !taskId.startsWith("team:")) return;
    // Block without side effects: nested blocked calls have no message_end.
    return { block: true, reason:
      'Qualified teammate IDs are not supported by TaskStop. Use TeamStop with task_id: "team:<member UUID>" from the owning lead session. No teammate was stopped.' };
  });
  pi.on("tool_result", async (event, ctx) => {
    if (memberMailbox || event.toolName !== "TaskStop" || !event.isError) return;
    const id = event.input.task_id ?? event.input.shell_id;
    if (typeof id !== "string" || id.startsWith("team:") ||
        event.content.length !== 1 || event.content[0]?.type !== "text" ||
        event.content[0].text !== `No running background process for task ${id}`) return;
    const team = await existingCoordinator(ctx);
    if (!team || !(await team.transport.listMembers(team.teamId))
      .some((member) => member.memberId === id && member.state === "active")) return;
    try {
      const text = await stopTeamMember(ctx, id);
      return {
        isError: false,
        content: [{ type: "text" as const, text }],
        details: { teamStop: true, nativeAbsence: true },
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Teammate stop refused: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    if (memberMailbox || !team.coordinator || !["TaskCreate", "TaskUpdate", "TaskExecute", "TaskStop"].includes(event.toolName)) {
      return;
    }
    const disk = checkLeadAdmission({
      cwd: ctx.cwd, agentDir: getAgentConfigDir(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
      piTasks: capturedPiTasks,
    }, team.leadReceipt);
    const state = await team.coordinator.transport.getTaskState(team.coordinator.teamId);
    const recovery = leadRecoveries.get(event.toolCallId);
    leadRecoveries.delete(event.toolCallId);
    if (recovery && !event.isError && disk.ok && state.fingerprint === recovery.storeFingerprint &&
        disk.value.tasks.some((task) => task.status === "pending") &&
        recovery.completed.every((before) => {
          const after = disk.value.tasks.find((task) => task.id === before.id);
          return after?.status === "completed" &&
            JSON.stringify(after.blocks) === JSON.stringify(before.blocks) &&
            JSON.stringify(after.blockedBy) === JSON.stringify(before.blockedBy);
        })) {
      await team.coordinator.transport.recordLeadRecovery({
        teamId: team.coordinator.teamId, previous: recovery.storeFingerprint,
        next: disk.value.storeFingerprint,
      });
      invalidateApprovals();
      return;
    }
    if (disk.ok && state.fingerprint === disk.value.storeFingerprint) return;
    invalidateApprovals();
    if (disk.ok && !state.pauseReason && (!recovery || !event.isError)) {
      try {
        await team.coordinator.transport.recordObservedTaskChange({
          teamId: team.coordinator.teamId,
          previous: state.fingerprint ?? "",
          next: disk.value.storeFingerprint,
        });
        return;
      } catch { /* another team commit or unsafe hold won the roster lock */ }
    }
    if (disk.ok && state.pauseReason === LEGACY_NATIVE_TASK_HOLD && !recovery) {
      try {
        await team.coordinator.transport.recordObservedTaskChange({
          teamId: team.coordinator.teamId,
          previous: state.fingerprint ?? "",
          next: disk.value.storeFingerprint,
        });
        return;
      } catch { /* leave a conflicting hold in place */ }
    }
    const reason = !disk.ok ? disk.reason : recovery
      ? "Lead pending-task recovery did not retain completed history or had an uncertain result"
      : "Uncorrelated task change or commit";
    await team.coordinator.transport.pauseTaskWrites(team.coordinator.teamId, reason);
    if (!state.pauseReason) {
      pi.sendMessage({
        customType: "teammate_notice",
        content: `Team task writes paused: ${reason}. Resolve the unsafe or uncertain state before starting a fresh team session.`,
        display: true,
      }, { triggerTurn: true, deliverAs: "steer" });
    }
  });
}
