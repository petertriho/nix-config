import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { TeamRuntime } from "../runtime/teams.ts";

export function registerTeamEvents(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  team: TeamRuntime,
  shouldRegister: (name: string) => boolean
): void {
  const { memberMailbox, existingCoordinator, stopTeamMember } = team;
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
    team.observeNativeTaskCall(event, ctx);
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
  pi.on("tool_result", (event, ctx) => team.reconcileNativeTaskResult(event, ctx));
}
