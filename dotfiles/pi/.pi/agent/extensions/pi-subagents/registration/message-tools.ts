import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { checkLeadAdmission } from "../teams/admission.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { SubagentRuntime } from "../runtime/refresh.ts";
import type { SessionState } from "../runtime/session-state.ts";
import type { TeamRuntime } from "../runtime/teams.ts";
import type { NamedFollowUp } from "../runtime/named-followups.ts";

export function registerMessageTools(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  runtime: SubagentRuntime,
  session: SessionState,
  team: TeamRuntime,
  followUp: NamedFollowUp,
  shouldRegister: (name: string) => boolean
): void {
  const { getAgentConfigDir } = discovery;
  const { runningSubagents } = runtime;
  const { finishedOrdinary } = session;
  const { memberEnv, memberMailbox, capturedPiTasks, existingCoordinator } = team;
  if (shouldRegister("SendMessage"))
    pi.registerTool({
      name: "SendMessage",
      label: "Send Message",
      exposure: "model-only",
      description: "Send a message to the team lead or an active teammate, or follow up with a finished ordinary agent.",
      parameters: Type.Object({
        recipient: Type.String({ description: "Exact name of a finished ordinary agent" }),
        content: Type.String({ description: "Follow-up instruction" }),
        type: Type.Optional(Type.String({ description: "Message type (only message is supported for ordinary agents)" })),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const fail = (error: string) => ({
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: { error },
        });
        if (_signal?.aborted) return fail("Message cancelled; no message or follow-up was sent.");
        if (params.type !== undefined && params.type !== "message") {
          return fail("Only ordinary follow-up messages are available; teammate control messages require team admission.");
        }
        const recipient = params.recipient.trim();
        if (!recipient || !params.content.trim()) return fail("Recipient and content must be non-empty.");
        if (memberMailbox) {
          if (ctx.sessionManager.getSessionId() !== memberEnv.sessionId) {
            return fail("Teammate session identity changed");
          }
          const message = recipient === "lead"
            ? await memberMailbox.sendToLead({ requestId: randomUUID(), body: params.content })
            : await memberMailbox.sendToMember({ recipient, requestId: randomUUID(), body: params.content });
          return {
            content: [{ type: "text" as const, text: `Message delivered to ${recipient}.` }],
            details: { id: message.id, status: "delivered", recipient },
          };
        }
        const activeCoordinator = await existingCoordinator(ctx);
        if (activeCoordinator) {
          const teammate = await activeCoordinator.findMember(recipient);
          if (teammate) {
            const admission = checkLeadAdmission({
              cwd: ctx.cwd, agentDir: getAgentConfigDir(),
              sessionId: ctx.sessionManager.getSessionId(),
              sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
              piTasks: capturedPiTasks,
            }, team.leadReceipt);
            if (!admission.ok) return fail(`Teammate messaging paused: ${admission.reason}`);
            const message = await activeCoordinator.send(recipient, params.content);
            return {
              content: [{ type: "text" as const, text: `Message delivered to ${recipient}.` }],
              details: { id: message.id, status: "delivered", recipient },
            };
          }
        }
        return followUp(_toolCallId, params, _signal, _onUpdate, ctx);
      },
    });

  if (shouldRegister("ListAgents"))
    pi.registerTool({
      name: "ListAgents",
      label: "List Agents",
      description: "List locally tracked running and finished ordinary agents. Team members appear only after team admission.",
      parameters: Type.Object({}),
      outputSchema: Type.Object({
        agents: Type.Array(Type.Object({
          id: Type.String(),
          name: Type.String(),
          status: Type.String(),
          agent: Type.Optional(Type.String()),
          epoch: Type.Optional(Type.Integer()),
        })),
      }),
      async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
        const activeCoordinator = memberMailbox ? undefined : await existingCoordinator(ctx);
        const teammates = memberMailbox
          ? (await memberMailbox.listMembers()).map((member) => ({
            id: member.memberId, name: member.name, status: member.state, epoch: member.epoch,
          }))
          : activeCoordinator
            ? (await activeCoordinator.transport.listMembers(activeCoordinator.teamId)).map((member) => ({
              id: member.memberId, name: member.name, status: member.state, epoch: member.epoch,
            }))
            : [];
        const agents = [
          ...teammates,
          ...[...runningSubagents.values()].map((agent) => ({
            ...(agent.team ? { team: agent.team.teamId } : {}),
            id: agent.id, name: agent.name, agent: agent.agent, status: "running" as const,
          })).filter((agent) => !("team" in agent)),
          ...[...finishedOrdinary.entries()].map(([name, agent]) => ({
            id: agent.id, name, status: "finished" as const,
          })),
        ];
        const structuredAgents = agents.map((agent) => {
          const record: Record<string, string | number> = {
            id: agent.id, name: agent.name, status: agent.status,
          };
          if ("agent" in agent && agent.agent !== undefined) record.agent = agent.agent;
          if ("epoch" in agent) record.epoch = agent.epoch;
          return record;
        });
        return {
          content: [{ type: "text" as const, text: agents.length
            ? agents.map(({ name, id, status }) => `${name} (${id}): ${status}`).join("\n")
            : "No agents in this session." }],
          details: { agents },
          structuredContent: { agents: structuredAgents },
        };
      },
    });
}
