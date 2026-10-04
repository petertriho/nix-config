import {
  resolveTaskDiskCandidate,
  type DiskCandidate,
  type TaskDiskInputs,
} from "../tasks/disk-policy.ts";

type AcceptedCandidate = Extract<DiskCandidate, { ok: true }>;

export interface LeadReceipt {
  sessionId: string;
  cwd: string;
  agentDir: string;
  incarnation: string;
  reason: "startup" | "new" | "reload";
  configFingerprint: string;
}

export interface ChildReceipt {
  memberId: string;
  memberEpoch: number;
  sessionId: string;
  cwd: string;
  agentDir: string;
  piTasks: string;
  configFingerprint: string;
}

type Admission<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Call only from a real session_start or authenticated member startup event. */
export function recordLeadStart(
  input: TaskDiskInputs,
  event: { reason: string; incarnation: string },
): Admission<LeadReceipt> {
  if (!["startup", "new", "reload"].includes(event.reason) || !event.incarnation) {
    return { ok: false, reason: "Team admission needs a fresh lead start or user-triggered reload" };
  }
  const candidate = resolveTaskDiskCandidate(input);
  if (!candidate.ok) return { ok: false, reason: candidate.reason };
  return {
    ok: true,
    value: {
      sessionId: input.sessionId!,
      cwd: input.cwd,
      agentDir: input.agentDir,
      incarnation: event.incarnation,
      reason: event.reason as LeadReceipt["reason"],
      configFingerprint: candidate.configFingerprint,
    },
  };
}

/** A receipt records adapter-observed inputs, not the private upstream store. */
export function checkLeadAdmission(input: TaskDiskInputs, receipt?: LeadReceipt): Admission<AcceptedCandidate> {
  const candidate = resolveTaskDiskCandidate(input);
  if (!candidate.ok) return { ok: false, reason: candidate.reason };
  if (!receipt || !receipt.incarnation || !receipt.sessionId ||
      receipt.sessionId !== input.sessionId || receipt.cwd !== input.cwd ||
      receipt.agentDir !== input.agentDir) {
    return { ok: false, reason: "Lead reload/start receipt is absent or belongs to another session or directory" };
  }
  if (receipt.configFingerprint !== candidate.configFingerprint) {
    return { ok: false, reason: "Lead task configuration changed; reload the lead before team admission" };
  }
  return { ok: true, value: candidate };
}

/**
 * Preflight before starting a child. The child must receive the absolute
 * candidate path as PI_TASKS; a later authenticated handshake is still needed.
 */
export function preflightTeamChild(
  lead: AcceptedCandidate,
  childInput: TaskDiskInputs,
): Admission<AcceptedCandidate> {
  if (lead.tasks.length > 0 && lead.tasks.every((task) => task.status === "completed")) {
    return { ok: false, reason: "A fresh child would clear the all-completed shared task list" };
  }
  if (childInput.piTasks !== lead.path) {
    return { ok: false, reason: "Child PI_TASKS must be pinned to the absolute lead task file" };
  }
  const child = resolveTaskDiskCandidate(childInput);
  if (!child.ok) return { ok: false, reason: child.reason };
  if (child.path !== lead.path || child.storeFingerprint !== lead.storeFingerprint) {
    return { ok: false, reason: "Lead and child disk task candidates differ" };
  }
  return { ok: true, value: child };
}

/** Check the child-specific startup receipt after launch, never the lead's. */
export function checkChildReceipt(
  candidate: AcceptedCandidate,
  input: TaskDiskInputs,
  identity: { memberId: string; memberEpoch: number },
  receipt?: ChildReceipt,
): Admission<AcceptedCandidate> {
  if (!receipt || receipt.memberId !== identity.memberId ||
      receipt.memberEpoch !== identity.memberEpoch || receipt.sessionId !== input.sessionId ||
      receipt.cwd !== input.cwd || receipt.agentDir !== input.agentDir ||
      receipt.piTasks !== candidate.path || receipt.configFingerprint !== candidate.configFingerprint) {
    return { ok: false, reason: "Child startup/reload receipt is absent, stale or mismatched" };
  }
  const current = resolveTaskDiskCandidate(input);
  if (!current.ok) return { ok: false, reason: current.reason };
  if (current.path !== candidate.path || current.configFingerprint !== candidate.configFingerprint ||
      current.storeFingerprint !== candidate.storeFingerprint) {
    return { ok: false, reason: "Child disk task candidate changed after startup" };
  }
  return { ok: true, value: current };
}
