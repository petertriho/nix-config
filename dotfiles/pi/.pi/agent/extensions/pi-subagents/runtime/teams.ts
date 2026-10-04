import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkLeadAdmission, recordLeadStart, type LeadReceipt } from "../teams/admission.ts";
import { answerApproval, canonicalCall, verifyApprovalRequest, type ApprovalRequest, type ApprovalResponse } from "../teams/approval.ts";
import { TeamCoordinator } from "../teams/coordinator.ts";
import { createMemberMailbox } from "../teams/transport.ts";
import { closeSurface } from "../adapters/tmux.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { SubagentRuntime } from "./refresh.ts";
import type { SessionState } from "./session-state.ts";

export function createTeamRuntime(pi: ExtensionAPI, discovery: AgentDiscovery, runtime: SubagentRuntime, session: SessionState) {
  const { getAgentConfigDir } = discovery;
  const { runningSubagents } = runtime;
  const memberEnv = {
    directory: process.env.PI_TEAM_DIRECTORY,
    teamId: process.env.PI_TEAM_ID,
    memberId: process.env.PI_TEAM_MEMBER_ID,
    token: process.env.PI_TEAM_MEMBER_TOKEN,
    sessionId: process.env.PI_TEAM_CHILD_SESSION_ID,
    leadSessionId: process.env.PI_TEAM_LEAD_SESSION_ID,
    epoch: Number(process.env.PI_TEAM_MEMBER_EPOCH),
  };
  const memberMailbox = memberEnv.directory && memberEnv.teamId && memberEnv.memberId &&
    memberEnv.token && memberEnv.sessionId && memberEnv.leadSessionId &&
    Number.isSafeInteger(memberEnv.epoch) && memberEnv.epoch > 0
      ? createMemberMailbox({
        directory: memberEnv.directory, teamId: memberEnv.teamId,
        leadSessionId: memberEnv.leadSessionId,
        member: {
          memberId: memberEnv.memberId, sessionId: memberEnv.sessionId,
          token: memberEnv.token, epoch: memberEnv.epoch,
        },
      })
      : undefined;
  // pi-tasks captures this override at factory time; later environment changes
  // cannot change its active task file.
  const capturedPiTasks = process.env.PI_TASKS;
  const leadIncarnation = randomUUID();
  let leadReceipt: LeadReceipt | undefined;
  let coordinator: TeamCoordinator | undefined;
  const answers = new Map<string, ApprovalResponse>();
  const invalidatedApprovals = new Set<string>();
  const invalidateApprovals = (): void => {
    for (const requestId of answers.keys()) invalidatedApprovals.add(requestId);
    answers.clear();
  };
  const openCoordinator = async (
    ctx: ExtensionContext, teamName?: string, taskFingerprint?: string,
  ): Promise<TeamCoordinator> => {
    if (!coordinator) {
      coordinator = await TeamCoordinator.open({
        directory: join(ctx.sessionManager.getSessionDir(), "artifacts", ctx.sessionManager.getSessionId(), "team"),
        leadSessionId: ctx.sessionManager.getSessionId(),
        teamName,
        taskFingerprint,
        onNotice: async ({ memberName, memberId, memberEpoch, memberSessionId, message }) => {
          if (message.kind === "approval_request") {
            const request = JSON.parse(message.body) as ApprovalRequest;
            if (request.requestId !== message.requestId || request.memberId !== memberId ||
                request.memberEpoch !== memberEpoch || request.memberSessionId !== memberSessionId ||
                request.leadSessionId !== ctx.sessionManager.getSessionId() ||
                !verifyApprovalRequest(request)) {
              throw new Error("Uncorrelated teammate approval request");
            }
            if (invalidatedApprovals.has(request.requestId)) {
              // The original response can already be in the mailbox. Never
              // approve this request again against a changed task baseline.
              return;
            }
            let answer = answers.get(request.requestId);
            if (!answer) {
              let approved = false;
              const fullInput = canonicalCall(request.input);
              if (ctx.mode === "tui" && ctx.hasUI && fullInput.length <= 4096) {
                approved = await ctx.ui.confirm(
                  `Approve ${memberName}'s exact ${request.toolName} call?`,
                  `Member: ${memberName} (${memberId}, epoch ${memberEpoch})\n` +
                  `Tool call: ${request.toolCallId}\nDigest: ${request.digest}\nInput: ${fullInput}`,
                );
              }
              answer = answerApproval(request, approved);
              answers.set(request.requestId, answer);
            }
            await coordinator!.transport.sendFromLead({
              teamId: coordinator!.teamId, to: memberId,
              requestId: request.requestId, kind: "approval_response",
              body: JSON.stringify(answer),
            });
            return;
          }
          if (message.kind === "result") {
            let receipt: {
              type?: string; approvalRequestId?: string; digest?: string;
              toolCallId?: string; previous?: string; next?: string;
            } | undefined;
            try { receipt = JSON.parse(message.body); } catch { /* ordinary result notice */ }
            if (receipt?.type === "task_commit") {
              const granted = receipt.approvalRequestId
                ? answers.get(receipt.approvalRequestId) : undefined;
              const current = checkLeadAdmission({
                cwd: ctx.cwd, agentDir: getAgentConfigDir(),
                sessionId: ctx.sessionManager.getSessionId(),
                sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
                piTasks: capturedPiTasks,
              }, leadReceipt);
              if (!granted?.approved || granted.memberId !== memberId ||
                  granted.memberEpoch !== memberEpoch || granted.digest !== receipt.digest ||
                  granted.toolCallId !== receipt.toolCallId || !receipt.previous || !receipt.next ||
                  !current.ok || current.value.storeFingerprint !== receipt.next) {
                await coordinator!.transport.pauseTaskWrites(coordinator!.teamId,
                  "Uncorrelated or conflicting teammate task commit");
                throw new Error("Team task commit could not be correlated; writes paused");
              }
              await coordinator!.transport.recordTaskCommit({
                teamId: coordinator!.teamId, memberId, epoch: memberEpoch,
                previous: receipt.previous, next: receipt.next,
              });
              answers.delete(receipt.approvalRequestId!);
              return;
            }
          }
          if (message.kind === "message" || message.kind === "idle" ||
              message.kind === "result" || message.kind === "error") {
            pi.sendMessage({
              customType: "teammate_notice",
              content: `${memberName}: ${message.body}`,
              display: true,
              details: { name: memberName, kind: message.kind, memberId: message.from },
            }, { triggerTurn: true, deliverAs: "steer" });
          }
        },
      });
    } else if (teamName && await coordinator.transport.getTeamName(coordinator.teamId) !== teamName) {
      throw new Error("This lead session already owns a differently named team");
    }
    return coordinator;
  };

  const existingCoordinator = async (ctx: ExtensionContext): Promise<TeamCoordinator | undefined> => {
    if (coordinator) return coordinator;
    const roster = join(ctx.sessionManager.getSessionDir(), "artifacts",
      ctx.sessionManager.getSessionId(), "team", "main", "roster.json");
    return existsSync(roster) ? openCoordinator(ctx) : undefined;
  };
  const stopTeamMember = async (ctx: ExtensionContext, id: string, signal?: AbortSignal): Promise<string> => {
    if (memberMailbox) throw new Error("Only the owning lead session can stop teammates");
    if (signal?.aborted) throw new Error("Teammate stop cancelled");
    const team = await existingCoordinator(ctx);
    if (!team) throw new Error("No team belongs to this lead session");
    if (!session.sessionActive || team.leadSessionId !== ctx.sessionManager.getSessionId()) {
      throw new Error("Only the owning active lead session can stop teammates");
    }
    const member = (await team.transport.listMembers(team.teamId))
      .find((entry) => entry.memberId === id && entry.state === "active");
    if (!member || !member.surface || !member.sessionFile) {
      throw new Error("Teammate is absent, stale or has no owned pane");
    }
    // Cancellation is safe until the pane close; once stopped, finish roster cleanup.
    if (signal?.aborted) throw new Error("Teammate stop cancelled");
    closeSurface(member.surface);
    const running = [...runningSubagents.values()].find((entry) =>
      entry.team?.memberId === member.memberId && entry.team.epoch === member.epoch);
    if (running) {
      running.abortController?.abort();
      runningSubagents.delete(running.id);
    }
    await team.transport.stopMember({
      teamId: team.teamId, memberId: member.memberId, epoch: member.epoch,
    });
    return `Teammate ${member.name} (team:${member.memberId}) stopped successfully`;
  };
  const leadRecoveries = new Map<string, {
    storeFingerprint: string;
    completed: Array<{ id: string; blocks: string[]; blockedBy: string[] }>;
  }>();
  function recordSessionStart(reason: string, ctx: ExtensionContext): void {
    const start = recordLeadStart({
      cwd: ctx.cwd,
      agentDir: getAgentConfigDir(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
      piTasks: capturedPiTasks,
    }, { reason, incarnation: leadIncarnation });
    leadReceipt = start.ok ? start.value : undefined;
  }
  function shutdown(): void {
    leadReceipt = undefined;
    answers.clear();
    invalidatedApprovals.clear();
    leadRecoveries.clear();
    coordinator?.close();
    coordinator = undefined;
  }
  return {
    memberEnv, memberMailbox, capturedPiTasks, leadRecoveries,
    invalidateApprovals, openCoordinator, existingCoordinator, stopTeamMember,
    recordSessionStart, shutdown,
    get leadReceipt() { return leadReceipt; },
    get coordinator() { return coordinator; },
  };
}
export type TeamRuntime = ReturnType<typeof createTeamRuntime>;
