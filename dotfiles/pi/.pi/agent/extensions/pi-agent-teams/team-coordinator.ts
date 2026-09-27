import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkChildReceipt, type ChildReceipt } from "./team-admission.ts";
import { createTeamTransport, restoreTeamLead, LEGACY_NATIVE_TASK_HOLD, type TeamMessage } from "./team-transport.ts";
import type { DiskCandidate, TaskDiskInputs } from "./task-disk-policy.ts";

type Candidate = Extract<DiskCandidate, { ok: true }>;
type Transport = ReturnType<typeof createTeamTransport>;

export interface CoordinatorNotice {
  message: TeamMessage;
  memberName: string;
  memberId: string;
  memberEpoch: number;
  memberSessionId: string;
}

/** One roster per lead session. No task store is kept in this coordinator. */
export class TeamCoordinator {
  private receipts = new Map<string, ChildReceipt>();
  private draining: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  readonly directory: string;
  readonly teamId: string;
  readonly leadSessionId: string;
  readonly transport: Transport;
  private readonly onNotice: (notice: CoordinatorNotice) => Promise<void>;
  private constructor(
    directory: string,
    teamId: string,
    leadSessionId: string,
    transport: Transport,
    onNotice: (notice: CoordinatorNotice) => Promise<void>,
  ) {
    this.directory = directory;
    this.teamId = teamId;
    this.leadSessionId = leadSessionId;
    this.transport = transport;
    this.onNotice = onNotice;
  }

  static async open(input: {
    directory: string; leadSessionId: string; teamName?: string;
    taskFingerprint?: string;
    onNotice: (notice: CoordinatorNotice) => Promise<void>;
  }): Promise<TeamCoordinator> {
    const teamId = "main";
    const roster = join(input.directory, teamId, "roster.json");
    let transport: Transport;
    if (existsSync(roster)) {
      ({ transport } = await restoreTeamLead({ ...input, teamId, sessionId: input.leadSessionId }));
    } else {
      const lead = { sessionId: input.leadSessionId, epoch: randomUUID(), token: randomUUID() };
      transport = createTeamTransport({ directory: input.directory, lead });
      await transport.createTeam(teamId, input.teamName ?? "main", input.taskFingerprint);
    }
    if (input.teamName && await transport.getTeamName(teamId) !== input.teamName) {
      throw new Error("This lead session already owns a differently named team");
    }
    const coordinator = new TeamCoordinator(
      input.directory, teamId, input.leadSessionId, transport, input.onNotice,
    );
    coordinator.timer = setInterval(() => {
      void coordinator.drain().catch(() => { /* retry transport failures on the next poll */ });
    }, 1000);
    coordinator.timer.unref?.();
    return coordinator;
  }

  async drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      for (const message of await this.transport.receiveNotices(this.teamId)) {
        try {
          const member = (await this.transport.listMembers(this.teamId))
            .find((candidate) => candidate.memberId === message.from && candidate.state === "active");
          if (!member) {
            // Obsolete traffic is terminal, not a reason to retry the whole inbox.
            // In particular, never forward a stopped member's approval request.
            this.receipts.delete(message.from);
          } else if (message.kind === "startup") {
            const receipt = JSON.parse(message.body) as ChildReceipt;
            if (receipt.memberId !== member.memberId || receipt.memberEpoch !== member.epoch ||
                receipt.sessionId !== member.sessionId) throw new Error("Forged teammate startup receipt");
            this.receipts.set(member.memberId, receipt);
          } else {
            await this.onNotice({
              message, memberName: member.name, memberId: member.memberId,
              memberEpoch: member.epoch, memberSessionId: member.sessionId,
            });
          }
          await this.transport.ackNotice({ teamId: this.teamId, messageId: message.id });
        } catch {
          // Leave only this notice pending for the transport's bounded retries.
          // Later notices (including startup receipts) must still be processed.
        }
      }
    })();
    try { await this.draining; } finally { this.draining = undefined; }
  }

  async awaitStartup(input: {
    memberId: string; memberEpoch: number; child: TaskDiskInputs; candidate: Candidate;
    signal?: AbortSignal; timeoutMs?: number;
  }): Promise<void> {
    const deadline = Date.now() + (input.timeoutMs ?? 20_000);
    while (Date.now() < deadline && !input.signal?.aborted) {
      await this.drain();
      const receipt = this.receipts.get(input.memberId);
      if (receipt) {
        const check = checkChildReceipt(input.candidate, input.child, {
          memberId: input.memberId, memberEpoch: input.memberEpoch,
        }, receipt);
        if (!check.ok) throw new Error(check.reason);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(input.signal?.aborted ? "Teammate startup cancelled" : "Teammate startup handshake timed out");
  }

  async addMember(input: { name: string; sessionId: string }): Promise<{
    memberId: string; token: string; epoch: number;
  }> {
    const memberId = randomUUID();
    const token = randomUUID();
    const epoch = 1;
    await this.transport.addMember({
      teamId: this.teamId,
      member: { memberId, name: input.name, sessionId: input.sessionId, token, epoch },
    });
    return { memberId, token, epoch };
  }

  async requireTaskFingerprint(expected: string): Promise<void> {
    const state = await this.transport.getTaskState(this.teamId);
    if (state.pauseReason === LEGACY_NATIVE_TASK_HOLD && state.fingerprint) {
      await this.transport.recordObservedTaskChange({
        teamId: this.teamId, previous: state.fingerprint, next: expected,
      });
      return;
    }
    if (state.pauseReason) throw new Error(`Team task writes paused: ${state.pauseReason}`);
    if (!state.fingerprint || state.fingerprint !== expected) {
      await this.transport.pauseTaskWrites(this.teamId, "Uncorrelated task file change");
      throw new Error("Team task list changed without a correlated lead or teammate commit");
    }
  }

  async findMember(name: string) {
    return (await this.transport.listMembers(this.teamId))
      .find((member) => member.name === name && member.state === "active");
  }

  async send(name: string, content: string): Promise<TeamMessage> {
    const member = await this.findMember(name);
    if (!member) throw new Error(`No active teammate "${name}"`);
    if (!this.receipts.has(member.memberId)) throw new Error("Teammate startup receipt is absent");
    return this.transport.sendFromLead({
      teamId: this.teamId, to: member.memberId, requestId: randomUUID(), body: content,
    });
  }

  isAdmitted(memberId: string): boolean {
    return this.receipts.has(memberId);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
