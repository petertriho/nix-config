import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkChildReceipt, type ChildReceipt } from "../teams/admission.ts";
import {
  makeApprovalRequest, verifyApprovalResponse, type ApprovalRequest, type ApprovalResponse,
} from "../teams/approval.ts";
import { resolveTaskDiskCandidate, type DiskCandidate, type TaskDiskInputs } from "../tasks/disk-policy.ts";
import { createMemberMailbox } from "../teams/transport.ts";
import { commitTeamTaskMutation, teamTaskVetoes, type TeamTaskMutation } from "../teams/task-writer.ts";

type Candidate = Extract<DiskCandidate, { ok: true }>;
const SAFE_READ_TOOLS = new Set([
  "read", "ls", "grep", "find", "TaskGet", "TaskList", "TaskOutput",
  "SendMessage", "ListAgents", "AgentInterrupt", "subagent_done", "caller_ping",
]);

/** This extension is loaded explicitly only into an adapter-launched teammate. */
export default function teamMember(pi: ExtensionAPI): void {
  const {
    PI_TEAM_DIRECTORY: directory, PI_TEAM_ID: teamId,
    PI_TEAM_MEMBER_ID: memberId, PI_TEAM_MEMBER_TOKEN: token,
    PI_TEAM_MEMBER_EPOCH: rawEpoch, PI_TEAM_CHILD_SESSION_ID: sessionId,
    PI_TEAM_LEAD_SESSION_ID: leadSessionId, PI_TASKS: taskFile,
  } = process.env;
  const epoch = Number(rawEpoch);
  if (!directory || !teamId || !memberId || !token || !sessionId ||
      !leadSessionId || !taskFile || !Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error("Incomplete teammate launch identity");
  }
  const mailbox = createMemberMailbox({
    directory, teamId, leadSessionId,
    member: { memberId, sessionId, token, epoch },
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  let receiving = false;
  let disk: TaskDiskInputs | undefined;
  let accepted: Candidate | undefined;
  let receipt: ChildReceipt | undefined;
  let pausedReason: string | undefined;
  const pausePath = join(directory, teamId, `pause-${memberId}.json`);
  const pause = (reason: string): void => {
    pausedReason = reason;
    try {
      if (!existsSync(pausePath)) {
        writeFileSync(pausePath, JSON.stringify({ reason, memberId, epoch }) + "\n", {
          mode: 0o600, flag: "wx",
        });
      }
    } catch { /* the in-memory hold still blocks this process */ }
  };
  const deepFreeze = (value: unknown): void => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  };
  const responses = new Map<string, ApprovalResponse>();
  const usedApprovals = new Set<string>();
  const delivered = new Map<string, { text: string; committed: boolean }>();
  const replacements = new Map<string, {
    toolName: string; sentinel: string; text: string; isError: boolean; committed: boolean;
  }>();
  const nestedCalls = new Set<string>();

  const pollMailbox = async (): Promise<void> => {
    if (receiving) return;
    receiving = true;
    try {
      for (const message of await mailbox.receive()) {
        if (message.kind === "approval_response") {
          if (message.from !== "lead") throw new Error("Non-lead approval response");
          responses.set(message.requestId, JSON.parse(message.body) as ApprovalResponse);
        } else if (message.kind === "message") {
          pi.sendUserMessage(
            `Message from ${message.from === "lead" ? "the team lead" : `teammate ${message.from}`}:\n\n${message.body}`,
            { deliverAs: "steer" },
          );
        } else {
          throw new Error(`Unexpected teammate mailbox message: ${message.kind}`);
        }
        await mailbox.ack(message.id);
      }
    } finally {
      receiving = false;
    }
  };

  pi.on("session_start", async (event, ctx) => {
    if (ctx.sessionManager.getSessionId() !== sessionId) {
      throw new Error("Teammate session identity changed");
    }
    const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
    disk = {
      cwd: ctx.cwd, agentDir, sessionId,
      sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
      piTasks: taskFile,
    };
    const candidate = resolveTaskDiskCandidate(disk);
    if (!candidate.ok) throw new Error(`Teammate task admission denied: ${candidate.reason}`);
    accepted = candidate;
    if (existsSync(pausePath)) {
      const state = await mailbox.taskState();
      if (event.reason === "reload" && !state.pauseReason &&
          state.fingerprint === candidate.storeFingerprint) {
        unlinkSync(pausePath);
        pausedReason = undefined;
      } else {
        const marker = JSON.parse(readFileSync(pausePath, "utf8")) as { reason?: string };
        pause(marker.reason ?? "Team task writes have an unsafe or uncertain result");
        throw new Error(`Teammate remains paused: ${pausedReason}`);
      }
    }
    receipt = {
      memberId, memberEpoch: epoch, sessionId, cwd: ctx.cwd, agentDir,
      piTasks: candidate.path, configFingerprint: candidate.configFingerprint,
    };
    // Allocate once per startup occurrence; transport retries retain this ID.
    const startupRequestId = `startup:${epoch}:${event.reason}:${randomUUID()}`;
    await mailbox.notice({
      kind: "startup",
      requestId: startupRequestId,
      body: JSON.stringify(receipt),
    });
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      void pollMailbox().catch((error: unknown) => {
        pause(error instanceof Error ? error.message : String(error));
        ctx.ui.notify(`Team mailbox paused: ${error instanceof Error ? error.message : String(error)}`, "error");
      });
    }, 1000);
    timer.unref?.();
  });

  pi.on("tool_execution_start", (event) => {
    if (event.parentToolCallId !== undefined) nestedCalls.add(event.toolCallId);
  });
  pi.on("tool_execution_end", (event) => {
    nestedCalls.delete(event.toolCallId);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (ctx.sessionManager.getSessionId() !== sessionId || !accepted || !receipt || !disk) {
      return { block: true, reason: "Teammate has no matching authenticated startup receipt" };
    }
    if (nestedCalls.has(event.toolCallId) &&
        (event.toolName === "TaskCreate" || event.toolName === "TaskUpdate")) {
      // Nested calls have no message_end for delivery of intercepted commit results.
      return {
        block: true,
        reason: `Nested ${event.toolName} is unavailable to a team member. Call ${event.toolName} directly for approval.`,
      };
    }
    if (SAFE_READ_TOOLS.has(event.toolName)) return;
    if (pausedReason) return { block: true, reason: `Teammate writes paused: ${pausedReason}` };
    if (["TaskExecute", "TaskStop"].includes(event.toolName)) {
      return { block: true, reason: `${event.toolName} is unavailable to a team member` };
    }
    const teamState = await mailbox.taskState();
    if (teamState.pauseReason) {
      pause(`Team lead paused writes: ${teamState.pauseReason}`);
      return { block: true, reason: pausedReason };
    }
    const diskNow = resolveTaskDiskCandidate(disk);
    if (!diskNow.ok || diskNow.path !== accepted.path ||
        diskNow.configFingerprint !== accepted.configFingerprint) {
      pause(diskNow.ok ? "Teammate task path or configuration changed" : diskNow.reason);
      return { block: true, reason: pausedReason };
    }
    if (!teamState.fingerprint || diskNow.storeFingerprint !== teamState.fingerprint) {
      return { block: true, reason: "Shared task list changed; retry after the lead checks its new baseline" };
    }
    accepted = diskNow;
    const checked = checkChildReceipt(accepted, disk, { memberId, memberEpoch: epoch }, receipt);
    if (!checked.ok) {
      pause(checked.reason);
      return { block: true, reason: `Teammate admission drift: ${checked.reason}` };
    }
    if (!event.input || typeof event.input !== "object" || Array.isArray(event.input)) {
      return { block: true, reason: "Unclassifiable tool input" };
    }
    const request = makeApprovalRequest({
      toolCallId: event.toolCallId, toolName: event.toolName,
      input: structuredClone(event.input), memberId, memberEpoch: epoch,
      memberSessionId: sessionId, leadSessionId,
    });
    await mailbox.notice({
      kind: "approval_request", requestId: request.requestId,
      body: JSON.stringify(request),
    });
    const approval = await (async (call: ApprovalRequest): Promise<ApprovalResponse | undefined> => {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline && !ctx.signal?.aborted && !pausedReason) {
        await pollMailbox();
        const answer = responses.get(call.requestId);
        if (answer) {
          responses.delete(call.requestId);
          return answer;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return undefined;
    })(request);
    if (!approval || !verifyApprovalResponse(request, approval) ||
        usedApprovals.has(request.requestId)) {
      return { block: true, reason: "Actual-user approval was denied, missing, stale or changed" };
    }
    usedApprovals.add(request.requestId);
    const latestRequest = makeApprovalRequest({
      toolCallId: event.toolCallId, toolName: event.toolName,
      input: structuredClone(event.input), memberId, memberEpoch: epoch,
      memberSessionId: sessionId, leadSessionId,
    });
    if (latestRequest.digest !== request.digest) {
      return { block: true, reason: "Tool arguments changed after approval" };
    }
    const approvedState = await mailbox.taskState();
    const approvedDisk = resolveTaskDiskCandidate(disk);
    if (approvedState.pauseReason || !approvedDisk.ok ||
        approvedDisk.path !== checked.value.path ||
        approvedDisk.configFingerprint !== checked.value.configFingerprint ||
        approvedDisk.storeFingerprint !== checked.value.storeFingerprint ||
        approvedState.fingerprint !== checked.value.storeFingerprint) {
      return { block: true, reason: "Task baseline changed after approval; request a new approval" };
    }
    if (event.toolName === "TaskCreate" || event.toolName === "TaskUpdate") {
      const mutation: TeamTaskMutation = { toolName: event.toolName, args: event.input };
      const result = await commitTeamTaskMutation({
        disk, expected: checked.value, mutation,
        member: { id: memberId, name: process.env.PI_SUBAGENT_NAME ?? memberId, epoch },
        approvedDigest: request.digest,
        digest: (call) => makeApprovalRequest({
          toolCallId: event.toolCallId, toolName: call.toolName, input: call.args,
          memberId, memberEpoch: epoch, memberSessionId: sessionId, leadSessionId,
        }).digest,
        vetoes: teamTaskVetoes(),
      });
      if (result.ok) {
        accepted = result.candidate;
        try {
          await mailbox.notice({
            kind: "result", requestId: `commit:${request.requestId}`,
            body: JSON.stringify({
              type: "task_commit", approvalRequestId: request.requestId,
              digest: request.digest, toolCallId: event.toolCallId,
              previous: checked.value.storeFingerprint, next: result.candidate.storeFingerprint,
            }),
          });
        } catch (error) {
          pause(`Task committed but ledger notice failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      else if (result.committed) pause(result.reason);
      const sentinel = `TEAM_INTERCEPTED_${randomUUID()}`;
      replacements.set(event.toolCallId, {
        toolName: event.toolName, sentinel,
        text: result.ok
          ? `${event.toolName} committed: ${result.task
              ? `#${result.task.id} ${result.task.subject} (${result.task.status})`
              : "task deleted"}; fields: ${result.changedFields.join(", ")}`
          : `Team task mutation refused: ${result.reason}`,
        isError: !result.ok, committed: result.ok || Boolean(result.committed),
      });
      return { block: true, reason: sentinel };
    }
    // A later extension cannot mutate the approved arguments in place.
    deepFreeze(event.input);
    return;
  });

  pi.on("tool_result", async (event) => {
    if (!disk || !accepted || event.toolName === "TaskCreate" || event.toolName === "TaskUpdate") return;
    try {
      const teamState = await mailbox.taskState();
      if (teamState.pauseReason) {
        pause(`Team lead paused writes: ${teamState.pauseReason}`);
        return;
      }
      // A teammate can commit before or during a safe-listed call, which has no
      // tool_call baseline refresh. Read disk after the awaited roster lookup.
      const current = resolveTaskDiskCandidate(disk);
      if (!current.ok || current.path !== accepted.path ||
          current.configFingerprint !== accepted.configFingerprint ||
          (current.storeFingerprint !== accepted.storeFingerprint &&
            current.storeFingerprint !== teamState.fingerprint)) {
        pause(current.ok ? "Native or external tool changed the shared task list" : current.reason);
        return;
      }
      // Our own committed baseline can be ahead of its notice to the lead.
      accepted = current;
    } catch (error) {
      // Pi reports tool_result handler errors but continues, so retain the hold.
      pause(`Shared task baseline check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "toolResult") return;
    const entry = replacements.get(event.message.toolCallId);
    if (!entry) return;
    if (event.message.toolName !== entry.toolName ||
        event.message.content[0]?.type !== "text" ||
        event.message.content[0].text !== entry.sentinel) {
      pause("A blocked teammate result could not be correlated after commit");
      return;
    }
    replacements.delete(event.message.toolCallId);
    delivered.set(event.message.toolCallId, { text: entry.text, committed: entry.committed });
    return { message: {
      ...event.message, isError: entry.isError,
      content: [{ type: "text" as const, text: entry.text }],
      details: { team: teamId, memberId, committed: entry.committed },
    } };
  });
  pi.on("turn_end", (event) => {
    const results = event.toolResults ?? [];
    if ([...replacements.values()].some((entry) => entry.committed) ||
        [...delivered.entries()].some(([id, entry]) => entry.committed &&
          !results.some((result) => result.role === "toolResult" &&
            result.toolCallId === id && result.content[0]?.type === "text" &&
            result.content[0].text === entry.text && !result.isError))) {
      pause("A committed task result was not delivered; start a fresh team session before retry");
      pi.sendUserMessage(`Team task list may have changed: ${pausedReason}`, { deliverAs: "steer" });
    }
    replacements.clear();
    delivered.clear();
  });
  pi.on("agent_settled", async () => {
    await mailbox.notice({ kind: "idle", requestId: randomUUID(), body: "Teammate is idle" });
  });
  pi.on("session_shutdown", () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    nestedCalls.clear();
  });
}
