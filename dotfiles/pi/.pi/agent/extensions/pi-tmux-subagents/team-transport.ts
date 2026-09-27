import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmodSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync,
  unlinkSync, writeFileSync, closeSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse } from "node:path";

interface LeadIdentity {
  sessionId: string;
  epoch: string;
  token: string;
}

interface MemberIdentity {
  memberId: string;
  sessionId: string;
  token: string;
  epoch?: number;
  name?: string;
  surface?: string;
  sessionFile?: string;
}

type MemberState = "active" | "stopping" | "stopped";
interface RosterMember extends Omit<Required<MemberIdentity>, "name" | "surface" | "sessionFile"> {
  name: string;
  surface?: string;
  sessionFile?: string;
  state: MemberState;
}

interface Roster {
  version: 1;
  name?: string;
  taskFingerprint?: string;
  pauseReason?: string;
  lead: LeadIdentity;
  members: RosterMember[];
  stopped: boolean;
}

export interface TeamMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  requestId: string;
  sequence: number;
  attempts: number;
  kind?: "message" | "startup" | "idle" | "result" | "error" | "approval_request" | "approval_response";
  recipientEpoch?: number;
}

interface Mailbox {
  version: 1;
  nextSequence: number;
  messages: TeamMessage[];
  acked: string[];
  seen: Record<string, { id: string; body: string; to: string }>;
}

const MAX_DELIVERY_ATTEMPTS = 5;
export const LEGACY_NATIVE_TASK_HOLD = "Native lead task tool changed the shared list outside a team commit";
const privateMode = 0o700;
const fileMode = 0o600;
const component = /^[a-zA-Z0-9_-]+$/;

function requireComponent(value: string): void {
  if (!component.test(value)) throw new Error("Unsafe team or member identifier");
}

function sameSecret(actual: string, expected: string): boolean {
  const first = Buffer.from(actual);
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}

function privateDirectory(path: string): void {
  for (let part = path; part !== parse(part).root; part = dirname(part)) {
    if (existsSync(part) && lstatSync(part).isSymbolicLink()) {
      throw new Error("Unsafe team directory symlink");
    }
  }
  mkdirSync(path, { recursive: true, mode: privateMode });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe team directory");
  if (stat.mode & 0o077) throw new Error("Team directory is not private");
}

function readPrivateFile(path: string): string {
  privateDirectory(dirname(path));
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      throw new Error("Unsafe team state symlink");
    }
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.mode & 0o077) throw new Error("Unsafe team state file permissions");
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}

function atomicWrite(path: string, value: unknown): void {
  privateDirectory(dirname(path));
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: fileMode, flag: "wx" });
    chmodSync(tmp, fileMode);
    renameSync(tmp, path);
  } finally {
    try { unlinkSync(tmp); } catch { /* the rename already consumed it */ }
  }
}

async function locked<T>(path: string, action: () => T | Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  privateDirectory(dirname(lockPath));
  const token = `${process.pid}:${randomUUID()}`;
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const fd = openSync(lockPath, "wx", fileMode);
      try { writeFileSync(fd, token); } finally { closeSync(fd); }
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const pid = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch {
            unlinkSync(lockPath);
            continue;
          }
        }
      } catch { /* another owner is creating the lock */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!acquired) throw new Error(`Team lock unavailable: ${lockPath}`);
  try { return await action(); } finally {
    try {
      if (readFileSync(lockPath, "utf8") === token) unlinkSync(lockPath);
    } catch { /* another owner may have reclaimed the lock */ }
  }
}

function readRoster(path: string): Roster {
  const value: unknown = JSON.parse(readPrivateFile(path));
  if (!value || typeof value !== "object" || (value as Roster).version !== 1 ||
      !Array.isArray((value as Roster).members)) {
    throw new Error("Incompatible team roster");
  }
  return value as Roster;
}

function readMailbox(path: string): Mailbox {
  if (!existsSync(path)) return { version: 1, nextSequence: 1, messages: [], acked: [], seen: {} };
  const value: unknown = JSON.parse(readPrivateFile(path));
  if (!value || typeof value !== "object" || (value as Mailbox).version !== 1 ||
      !Array.isArray((value as Mailbox).messages) || !Array.isArray((value as Mailbox).acked) ||
      !(value as Mailbox).seen || !Number.isSafeInteger((value as Mailbox).nextSequence)) {
    throw new Error("Incompatible team mailbox");
  }
  return value as Mailbox;
}

/** Low-level transport; caller admission must precede creating or joining a team. */
export function createTeamTransport(options: { directory: string; lead: LeadIdentity }) {
  if (!isAbsolute(options.directory)) throw new Error("Absolute team directory required");
  const { lead, directory } = options;
  if (!lead.sessionId || !lead.epoch || !lead.token) throw new Error("Lead identity required");
  const teamDir = (teamId: string) => {
    requireComponent(teamId);
    return join(directory, teamId);
  };
  const rosterPath = (teamId: string) => join(teamDir(teamId), "roster.json");
  const mailboxPath = (teamId: string, memberId: string) => {
    requireComponent(memberId);
    return join(teamDir(teamId), "mailboxes", `${memberId}.json`);
  };
  const authorizeLead = (roster: Roster) => {
    if (roster.lead.sessionId !== lead.sessionId || roster.lead.epoch !== lead.epoch ||
        !sameSecret(roster.lead.token, lead.token)) throw new Error("Team lead ownership or epoch denied");
  };
  const authorizeMember = (roster: Roster, identity: MemberIdentity): RosterMember => {
    const member = roster.members.find((candidate) => candidate.memberId === identity.memberId);
    if (!member || member.sessionId !== identity.sessionId || member.epoch !== (identity.epoch ?? 1) ||
        !sameSecret(member.token, identity.token) || member.state !== "active") {
      throw new Error("Member credential, session or epoch denied");
    }
    return member;
  };
  const withinTeam = async <T>(teamId: string, action: (roster: Roster) => T | Promise<T>): Promise<T> =>
    locked(rosterPath(teamId), () => {
      const roster = readRoster(rosterPath(teamId));
      authorizeLead(roster);
      return action(roster);
    });
  const withinMailbox = async <T>(teamId: string, memberId: string, action: (box: Mailbox) => T) => {
    const path = mailboxPath(teamId, memberId);
    return locked(path, () => {
      const box = readMailbox(path);
      const value = action(box);
      atomicWrite(path, box);
      return value;
    });
  };
  return {
    async createTeam(teamId: string, name = "main", taskFingerprint?: string): Promise<void> {
      const path = rosterPath(teamId);
      privateDirectory(teamDir(teamId));
      await locked(path, () => {
        if (existsSync(path)) throw new Error("Team roster already exists");
        if (!name.trim()) throw new Error("Team name required");
        atomicWrite(path, {
          version: 1, name, taskFingerprint, lead, members: [], stopped: false,
        } satisfies Roster);
      });
    },
    async getTeamName(teamId: string): Promise<string> {
      return withinTeam(teamId, (roster) => roster.name ?? "main");
    },
    async getTaskState(teamId: string): Promise<{ fingerprint?: string; pauseReason?: string }> {
      return withinTeam(teamId, (roster) => ({
        fingerprint: roster.taskFingerprint, pauseReason: roster.pauseReason,
      }));
    },
    async recordTaskCommit(input: {
      teamId: string; memberId: string; epoch: number;
      previous: string; next: string;
    }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        const member = roster.members.find((entry) => entry.memberId === input.memberId &&
          entry.epoch === input.epoch && entry.state === "active");
        if (!member || !input.next || roster.pauseReason ||
            !roster.taskFingerprint || roster.taskFingerprint !== input.previous) {
          throw new Error("Team task ledger conflict; stop writes until the uncertain commit is resolved");
        }
        roster.taskFingerprint = input.next;
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async recordLeadRecovery(input: {
      teamId: string; previous: string; next: string;
    }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        if (roster.pauseReason || !roster.taskFingerprint ||
            roster.taskFingerprint !== input.previous || !input.next) {
          throw new Error("Lead recovery conflicts with team task ledger");
        }
        roster.taskFingerprint = input.next;
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async recordObservedTaskChange(input: {
      teamId: string; previous: string; next: string;
    }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        if (!input.previous || !input.next || roster.taskFingerprint !== input.previous ||
            (roster.pauseReason && roster.pauseReason !== LEGACY_NATIVE_TASK_HOLD)) {
          throw new Error("Task ledger changed or has an unsafe hold");
        }
        roster.taskFingerprint = input.next;
        if (roster.pauseReason === LEGACY_NATIVE_TASK_HOLD) delete roster.pauseReason;
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async pauseTaskWrites(teamId: string, reason: string): Promise<void> {
      await withinTeam(teamId, (roster) => {
        if (!roster.pauseReason) roster.pauseReason = reason;
        atomicWrite(rosterPath(teamId), roster);
      });
    },
    async addMember(input: { teamId: string; member: MemberIdentity }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        if (roster.stopped) throw new Error("Team is stopped");
        requireComponent(input.member.memberId);
        const name = input.member.name ?? input.member.memberId;
        if (!name.trim()) throw new Error("Member name required");
        if (!input.member.sessionId || !input.member.token) throw new Error("Member identity required");
        if (roster.members.some((member) => member.memberId === input.member.memberId)) {
          throw new Error("Member already exists");
        }
        if (roster.members.some((member) => member.name === name)) {
          throw new Error("Member name already exists");
        }
        roster.members.push({ ...input.member, name, epoch: input.member.epoch ?? 1, state: "active" });
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async restoreMember(input: { teamId: string; member: MemberIdentity & { epoch: number } }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        if (roster.stopped) throw new Error("Team is stopped");
        const old = roster.members.find((member) => member.memberId === input.member.memberId);
        if (!old || !Number.isSafeInteger(input.member.epoch) || input.member.epoch <= old.epoch ||
            !input.member.sessionId || !input.member.token ||
            old.sessionId === input.member.sessionId || sameSecret(old.token, input.member.token)) {
          throw new Error("Member restoration needs a new process, token and increasing epoch");
        }
        if (input.member.name && input.member.name !== old.name) {
          throw new Error("Member restoration cannot change its name");
        }
        Object.assign(old, input.member, { name: old.name, state: "active" });
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async listMembers(teamId: string): Promise<Array<Omit<RosterMember, "token">>> {
      return withinTeam(teamId, (roster) => roster.members.map(({ token: _secret, ...member }) => ({ ...member })));
    },
    async updateMemberRuntime(input: {
      teamId: string; memberId: string; surface: string; sessionFile: string;
    }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        const member = roster.members.find((entry) => entry.memberId === input.memberId && entry.state === "active");
        if (!member || !input.surface || !isAbsolute(input.sessionFile)) {
          throw new Error("Member runtime cannot be recorded");
        }
        member.surface = input.surface;
        member.sessionFile = input.sessionFile;
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async stopMember(input: { teamId: string; memberId: string; epoch: number }): Promise<void> {
      await withinTeam(input.teamId, (roster) => {
        const member = roster.members.find((entry) => entry.memberId === input.memberId &&
          entry.epoch === input.epoch && entry.state === "active");
        if (!member) throw new Error("Member is absent, stale or already stopped");
        member.state = "stopped";
        atomicWrite(rosterPath(input.teamId), roster);
      });
    },
    async send(input: {
      teamId: string; from: MemberIdentity; to: string; requestId: string; body: string;
    }): Promise<TeamMessage> {
      return withinTeam(input.teamId, async (roster) => {
        if (roster.stopped) throw new Error("Team is stopped");
        const sender = authorizeMember(roster, input.from);
        const target = roster.members.find((member) => member.memberId === input.to && member.state === "active");
        if (!target) throw new Error("Recipient is not an active member of this lead");
        if (!input.requestId || !input.body || Buffer.byteLength(input.body) > 65_536) {
          throw new Error("Invalid team message or request ID");
        }
        return withinMailbox(input.teamId, target.memberId, (box) => {
          const key = `${sender.memberId}:${sender.epoch}:${input.requestId}`;
          const seen = box.seen[key];
          if (seen) {
            if (seen.body !== input.body || seen.to !== input.to) throw new Error("Conflicting duplicate request");
            const old = box.messages.find((message) => message.id === seen.id);
            if (!old) throw new Error("Deduplication history is incomplete");
            return old;
          }
          const message: TeamMessage = {
            id: randomUUID(), from: sender.memberId, to: target.memberId,
            requestId: input.requestId, body: input.body, sequence: box.nextSequence++, attempts: 0,
            recipientEpoch: target.epoch,
          };
          box.messages.push(message);
          box.seen[key] = { id: message.id, body: message.body, to: message.to };
          return message;
        });
      });
    },
    async sendFromLead(input: {
      teamId: string; to: string; requestId: string; body: string;
      kind?: "message" | "approval_response";
    }): Promise<TeamMessage> {
      return withinTeam(input.teamId, async (roster) => {
        if (roster.stopped) throw new Error("Team is stopped");
        const target = roster.members.find((member) => member.memberId === input.to && member.state === "active");
        if (!target) throw new Error("Recipient is not an active member of this lead");
        if (!input.requestId || !input.body || Buffer.byteLength(input.body) > 65_536) {
          throw new Error("Invalid team message or request ID");
        }
        return withinMailbox(input.teamId, target.memberId, (box) => {
          const key = `lead:${roster.lead.epoch}:${input.requestId}`;
          const seen = box.seen[key];
          if (seen) {
            if (seen.body !== input.body || seen.to !== input.to) throw new Error("Conflicting duplicate request");
            const old = box.messages.find((message) => message.id === seen.id);
            if (!old || old.kind !== (input.kind ?? "message")) throw new Error("Conflicting duplicate message kind");
            return old;
          }
          const message: TeamMessage = {
            id: randomUUID(), from: "lead", to: target.memberId, kind: input.kind ?? "message",
            requestId: input.requestId, body: input.body, sequence: box.nextSequence++, attempts: 0,
            recipientEpoch: target.epoch,
          };
          box.messages.push(message);
          box.seen[key] = { id: message.id, body: message.body, to: message.to };
          return message;
        });
      });
    },
    async receive(input: { teamId: string; member: MemberIdentity }): Promise<TeamMessage[]> {
      return withinTeam(input.teamId, async (roster) => {
        const member = authorizeMember(roster, input.member);
        if (roster.stopped) throw new Error("Team is stopped");
        return withinMailbox(input.teamId, member.memberId, (box) => {
          const pending = box.messages.filter((message) =>
            !box.acked.includes(message.id) && (message.recipientEpoch ?? 1) === member.epoch);
          if (pending.some((message) => message.attempts >= MAX_DELIVERY_ATTEMPTS)) {
            throw new Error("Team delivery retries exhausted; inspect and acknowledge the mailbox");
          }
          for (const message of pending) message.attempts++;
          return pending.map((message) => ({ ...message }));
        });
      });
    },
    async ack(input: { teamId: string; member: MemberIdentity; messageId: string }): Promise<void> {
      await withinTeam(input.teamId, async (roster) => {
        const member = authorizeMember(roster, input.member);
        await withinMailbox(input.teamId, member.memberId, (box) => {
          if (!box.messages.some((message) => message.id === input.messageId)) {
            throw new Error("Message does not belong to this mailbox");
          }
          if (!box.acked.includes(input.messageId)) box.acked.push(input.messageId);
        });
      });
    },
    async shutdown(teamId: string): Promise<void> {
      await withinTeam(teamId, (roster) => {
        roster.stopped = true;
        for (const member of roster.members) member.state = "stopped";
        atomicWrite(rosterPath(teamId), roster);
      });
    },
    async receiveNotices(teamId: string): Promise<TeamMessage[]> {
      return withinTeam(teamId, () => withinMailbox(teamId, "lead", (box) => {
        const pending = box.messages.filter((message) => !box.acked.includes(message.id));
        if (pending.some((message) => message.attempts >= MAX_DELIVERY_ATTEMPTS)) {
          throw new Error("Lead notice retries exhausted; inspect and acknowledge the mailbox");
        }
        for (const message of pending) message.attempts++;
        return pending.map((message) => ({ ...message }));
      }));
    },
    async ackNotice(input: { teamId: string; messageId: string }): Promise<void> {
      await withinTeam(input.teamId, () => withinMailbox(input.teamId, "lead", (box) => {
        if (!box.messages.some((message) => message.id === input.messageId)) {
          throw new Error("Notice does not belong to this lead");
        }
        if (!box.acked.includes(input.messageId)) box.acked.push(input.messageId);
      }));
    },
  };
}

/** Rotate the lead credential after reload; the old extension can no longer write. */
export async function restoreTeamLead(input: {
  directory: string; teamId: string; sessionId: string;
}): Promise<{ transport: ReturnType<typeof createTeamTransport>; lead: LeadIdentity }> {
  if (!isAbsolute(input.directory)) throw new Error("Absolute team directory required");
  requireComponent(input.teamId);
  const path = join(input.directory, input.teamId, "roster.json");
  const lead = await locked(path, () => {
    const roster = readRoster(path);
    if (roster.stopped || roster.lead.sessionId !== input.sessionId) {
      throw new Error("Cannot restore a stopped or foreign team");
    }
    const next: LeadIdentity = { sessionId: input.sessionId, epoch: randomUUID(), token: randomUUID() };
    roster.lead = next;
    atomicWrite(path, roster);
    return next;
  });
  return { lead, transport: createTeamTransport({ directory: input.directory, lead }) };
}

/** Child-side mailbox access never requires or returns the lead credential. */
export function createMemberMailbox(options: {
  directory: string;
  teamId: string;
  member: MemberIdentity;
  leadSessionId: string;
}) {
  const { directory, teamId, member: identity, leadSessionId } = options;
  if (!isAbsolute(directory)) throw new Error("Absolute team directory required");
  requireComponent(teamId);
  requireComponent(identity.memberId);
  const roster = join(directory, teamId, "roster.json");
  const mailbox = (memberId: string) => {
    requireComponent(memberId);
    return join(directory, teamId, "mailboxes", `${memberId}.json`);
  };
  const withMember = async <T>(action: (roster: Roster, member: RosterMember) => T | Promise<T>) =>
    locked(roster, async () => {
      const current = readRoster(roster);
      if (current.stopped || current.lead.sessionId !== leadSessionId) {
        throw new Error("Foreign or stopped team lead denied");
      }
      const member = current.members.find((entry) => entry.memberId === identity.memberId);
      if (!member || member.sessionId !== identity.sessionId || member.epoch !== (identity.epoch ?? 1) ||
          member.state !== "active" || !sameSecret(member.token, identity.token)) {
        throw new Error("Member credential, session or epoch denied");
      }
      return action(current, member);
    });
  const withBox = async <T>(memberId: string, action: (box: Mailbox) => T) => {
    const path = mailbox(memberId);
    return locked(path, () => {
      const box = readMailbox(path);
      const value = action(box);
      atomicWrite(path, box);
      return value;
    });
  };
  return {
    taskState(): Promise<{ fingerprint?: string; pauseReason?: string }> {
      return withMember((roster) => ({
        fingerprint: roster.taskFingerprint, pauseReason: roster.pauseReason,
      }));
    },
    listMembers(): Promise<Array<{ memberId: string; name: string; state: MemberState; epoch: number }>> {
      return withMember((roster) => roster.members.map((member) => ({
        memberId: member.memberId, name: member.name, state: member.state, epoch: member.epoch,
      })));
    },
    sendToMember(input: { recipient: string; requestId: string; body: string }): Promise<TeamMessage> {
      return withMember((roster, sender) => {
        const target = roster.members.find((entry) => entry.name === input.recipient && entry.state === "active");
        if (!target) throw new Error(`No active teammate "${input.recipient}"`);
        if (!input.requestId || !input.body || Buffer.byteLength(input.body) > 65_536) {
          throw new Error("Invalid team message or request ID");
        }
        return withBox(target.memberId, (box) => {
          const key = `${sender.memberId}:${sender.epoch}:${input.requestId}`;
          const seen = box.seen[key];
          if (seen) {
            if (seen.body !== input.body || seen.to !== target.memberId) {
              throw new Error("Conflicting duplicate request");
            }
            const old = box.messages.find((message) => message.id === seen.id);
            if (!old) throw new Error("Deduplication history is incomplete");
            return old;
          }
          const message: TeamMessage = {
            id: randomUUID(), from: sender.memberId, to: target.memberId, kind: "message",
            requestId: input.requestId, body: input.body, sequence: box.nextSequence++, attempts: 0,
            recipientEpoch: target.epoch,
          };
          box.messages.push(message);
          box.seen[key] = { id: message.id, body: message.body, to: message.to };
          return message;
        });
      });
    },
    sendToLead(input: { requestId: string; body: string }): Promise<TeamMessage> {
      return withMember((_roster, sender) => {
        if (!input.requestId || !input.body || Buffer.byteLength(input.body) > 65_536) {
          throw new Error("Invalid team message or request ID");
        }
        return withBox("lead", (box) => {
          const key = `${sender.memberId}:${sender.epoch}:${input.requestId}`;
          const seen = box.seen[key];
          if (seen) {
            if (seen.body !== input.body || seen.to !== "lead") throw new Error("Conflicting duplicate request");
            const old = box.messages.find((message) => message.id === seen.id);
            if (!old || old.kind !== "message") throw new Error("Conflicting duplicate message kind");
            return old;
          }
          const message: TeamMessage = {
            id: randomUUID(), from: sender.memberId, to: "lead", kind: "message",
            requestId: input.requestId, body: input.body, sequence: box.nextSequence++, attempts: 0,
          };
          box.messages.push(message);
          box.seen[key] = { id: message.id, body: message.body, to: message.to };
          return message;
        });
      });
    },
    notice(input: { kind: "startup" | "idle" | "result" | "error" | "approval_request"; requestId: string; body: string }): Promise<TeamMessage> {
      return withMember((_roster, sender) => {
        if (!["startup", "idle", "result", "error", "approval_request"].includes(input.kind) ||
            !input.requestId || !input.body || Buffer.byteLength(input.body) > 65_536) {
          throw new Error("Invalid team notice");
        }
        return withBox("lead", (box) => {
          const key = `${sender.memberId}:${sender.epoch}:${input.requestId}`;
          const seen = box.seen[key];
          if (seen) {
            if (seen.body !== input.body || seen.to !== "lead") throw new Error("Conflicting duplicate notice");
            const old = box.messages.find((message) => message.id === seen.id);
            if (!old || old.kind !== input.kind) throw new Error("Conflicting duplicate notice kind");
            return old;
          }
          const notice: TeamMessage = {
            id: randomUUID(), from: sender.memberId, to: "lead", kind: input.kind,
            requestId: input.requestId, body: input.body, sequence: box.nextSequence++, attempts: 0,
          };
          box.messages.push(notice);
          box.seen[key] = { id: notice.id, body: notice.body, to: notice.to };
          return notice;
        });
      });
    },
    send(input: { to: string; requestId: string; body: string }): Promise<TeamMessage> {
      return withMember((current, sender) => {
        const recipient = current.members.find((entry) => entry.memberId === input.to && entry.state === "active");
        if (!recipient) throw new Error("Recipient is not an active member of this lead");
        if (!input.requestId || !input.body || Buffer.byteLength(input.body) > 65_536) {
          throw new Error("Invalid team message or request ID");
        }
        return withBox(recipient.memberId, (box) => {
          const key = `${sender.memberId}:${sender.epoch}:${input.requestId}`;
          const seen = box.seen[key];
          if (seen) {
            if (seen.body !== input.body || seen.to !== input.to) throw new Error("Conflicting duplicate request");
            const old = box.messages.find((message) => message.id === seen.id);
            if (!old) throw new Error("Deduplication history is incomplete");
            return old;
          }
          const message: TeamMessage = {
            id: randomUUID(), from: sender.memberId, to: recipient.memberId,
            requestId: input.requestId, body: input.body, sequence: box.nextSequence++, attempts: 0,
            recipientEpoch: recipient.epoch,
          };
          box.messages.push(message);
          box.seen[key] = { id: message.id, body: message.body, to: message.to };
          return message;
        });
      });
    },
    receive(): Promise<TeamMessage[]> {
      return withMember((_roster, member) => withBox(member.memberId, (box) => {
        const pending = box.messages.filter((message) =>
          !box.acked.includes(message.id) && (message.recipientEpoch ?? 1) === member.epoch);
        if (pending.some((message) => message.attempts >= MAX_DELIVERY_ATTEMPTS)) {
          throw new Error("Team delivery retries exhausted; inspect and acknowledge the mailbox");
        }
        for (const message of pending) message.attempts++;
        return pending.map((message) => ({ ...message }));
      }));
    },
    ack(messageId: string): Promise<void> {
      return withMember((_roster, member) => withBox(member.memberId, (box) => {
        if (!box.messages.some((message) => message.id === messageId)) {
          throw new Error("Message does not belong to this mailbox");
        }
        if (!box.acked.includes(messageId)) box.acked.push(messageId);
      }));
    },
  };
}
