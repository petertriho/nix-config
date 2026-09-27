import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  resolveTaskDiskCandidate,
  type DiskCandidate,
  type DiskTask,
  type TaskDiskInputs,
} from "./task-disk-policy.ts";

type Candidate = Extract<DiskCandidate, { ok: true }>;
export type TeamTaskMutation =
  | { toolName: "TaskCreate"; args: Record<string, unknown> }
  | { toolName: "TaskUpdate"; args: Record<string, unknown> };
export type PreCommitVeto = (call: Readonly<{
  toolName: TeamTaskMutation["toolName"];
  args: Readonly<Record<string, unknown>>;
  memberId: string;
  memberEpoch: number;
}>) => string | undefined | Promise<string | undefined>;

const registeredVetoes = new Set<PreCommitVeto>();

/** Trusted extensions register supported team-write vetoes through this API. */
export function registerTeamTaskVeto(veto: PreCommitVeto): () => void {
  registeredVetoes.add(veto);
  return () => { registeredVetoes.delete(veto); };
}

export function teamTaskVetoes(): readonly PreCommitVeto[] {
  return [...registeredVetoes];
}

export interface TaskCommitRequest {
  disk: TaskDiskInputs;
  expected: Candidate;
  mutation: TeamTaskMutation;
  member: { id: string; name: string; epoch: number };
  /** An approval for the exact canonical call, issued by the lead's real UI. */
  approvedDigest: string;
  digest: (mutation: TeamTaskMutation) => string;
  vetoes: readonly PreCommitVeto[];
}

export type TaskCommit =
  | { ok: true; task: DiskTask | undefined; changedFields: string[]; warnings: string[]; candidate: Candidate }
  | { ok: false; reason: string; conflict?: boolean; committed?: boolean };

const CREATE_KEYS = new Set(["subject", "description", "activeForm", "metadata"]);
const UPDATE_KEYS = new Set([
  "taskId", "status", "subject", "description", "activeForm",
  "owner", "metadata", "addBlocks", "addBlockedBy",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function validate(mutation: TeamTaskMutation): void {
  const keys = mutation.toolName === "TaskCreate" ? CREATE_KEYS : UPDATE_KEYS;
  for (const key of Object.keys(mutation.args)) {
    if (!keys.has(key)) throw new Error(`Unsupported team task field: ${key}`);
  }
  if (mutation.toolName === "TaskCreate") {
    text(mutation.args.subject, "subject");
    text(mutation.args.description, "description");
  } else {
    text(mutation.args.taskId, "taskId");
  }
  for (const key of ["subject", "description", "activeForm", "owner"]) {
    const value = mutation.args[key];
    if (value !== undefined && typeof value !== "string") throw new Error(`${key} must be a string`);
  }
  if (mutation.args.metadata !== undefined && !isRecord(mutation.args.metadata)) {
    throw new Error("Task metadata must be an object");
  }
  for (const key of ["addBlocks", "addBlockedBy"]) {
    const value = mutation.args[key];
    if (value !== undefined && (!Array.isArray(value) ||
      value.some((id) => typeof id !== "string" || !/^[1-9]\d*$/.test(id)))) {
      throw new Error(`${key} must contain task IDs`);
    }
  }
  if (mutation.args.status !== undefined &&
      !["pending", "in_progress", "completed", "deleted"].includes(String(mutation.args.status))) {
    throw new Error("Invalid task status");
  }
}

function ensureNoCycles(tasks: DiskTask[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("Task dependency cycle denied");
    if (visited.has(id)) return;
    const task = byId.get(id);
    if (!task) throw new Error(`Missing task dependency #${id}`);
    visiting.add(id);
    for (const next of task.blockedBy) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}

function applyMutation(candidate: Candidate, mutation: TeamTaskMutation, memberName: string): {
  task: DiskTask | undefined; tasks: DiskTask[]; nextId: number; changedFields: string[]; warnings: string[];
} {
  validate(mutation);
  const tasks = structuredClone(candidate.tasks);
  const args = mutation.args;
  const now = Date.now();
  if (mutation.toolName === "TaskCreate") {
    const task: DiskTask = {
      id: String(candidate.nextId),
      subject: args.subject as string, description: args.description as string,
      status: "pending", activeForm: args.activeForm,
      owner: undefined, metadata: (args.metadata ?? {}) as Record<string, unknown>,
      blocks: [], blockedBy: [], createdAt: now, updatedAt: now,
    };
    tasks.push(task);
    return { task, tasks, nextId: candidate.nextId + 1, changedFields: ["created"], warnings: [] };
  }
  const id = args.taskId as string;
  const task = tasks.find((entry) => entry.id === id);
  if (!task) throw new Error(`Task #${id} not found`);
  if (task.owner && task.owner !== memberName) throw new Error(`Task #${id} is owned by ${task.owner}`);
  if (args.owner && args.owner !== memberName) throw new Error("A teammate cannot assign another owner");
  if (args.status === "completed" && task.blockedBy.some((blocker) =>
    tasks.find((entry) => entry.id === blocker)?.status !== "completed")) {
    throw new Error("Task has incomplete blockers");
  }
  if (args.status === "completed" && tasks.some((entry) =>
    entry.blockedBy.includes(id) && entry.metadata?.agentType)) {
    throw new Error("Task completion would auto-cascade an agent task");
  }
  if (args.status === "deleted") {
    const remaining = tasks.filter((entry) => entry.id !== id);
    for (const entry of remaining) {
      entry.blocks = entry.blocks.filter((edge) => edge !== id);
      entry.blockedBy = entry.blockedBy.filter((edge) => edge !== id);
    }
    return { task: undefined, tasks: remaining, nextId: candidate.nextId, changedFields: ["deleted"], warnings: [] };
  }
  const changedFields: string[] = [];
  for (const key of ["status", "subject", "description", "activeForm", "owner"] as const) {
    if (args[key] !== undefined) {
      Object.assign(task, { [key]: args[key] });
      changedFields.push(key);
    }
  }
  if (isRecord(args.metadata)) {
    for (const [key, value] of Object.entries(args.metadata)) {
      if (value === null) delete task.metadata[key];
      else task.metadata[key] = value;
    }
    changedFields.push("metadata");
  }
  for (const [key, reverse] of [
    ["addBlocks", "blockedBy"],
    ["addBlockedBy", "blocks"],
  ] as const) {
    if (!Array.isArray(args[key]) || args[key].length === 0) continue;
    const ownKey = key === "addBlocks" ? "blocks" : "blockedBy";
    for (const edge of args[key] as string[]) {
      const target = tasks.find((entry) => entry.id === edge);
      if (!target || edge === id) throw new Error(`Invalid dependency edge #${id} -> #${edge}`);
      if (!task[ownKey].includes(edge)) task[ownKey].push(edge);
      if (!target[reverse].includes(id)) target[reverse].push(id);
      target.updatedAt = now;
    }
    changedFields.push(ownKey);
  }
  task.updatedAt = now;
  ensureNoCycles(tasks);
  return { task, tasks, nextId: candidate.nextId, changedFields, warnings: [] };
}

async function lock<T>(path: string, action: () => Promise<T>): Promise<T> {
  mkdirSync(dirname(path), { recursive: true });
  const token = `${process.pid}:${randomUUID()}`;
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      writeFileSync(path, token, { flag: "wx" });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const raw = readFileSync(path, "utf8");
        const pid = Number.parseInt(raw, 10);
        let running = false;
        if (pid > 0) {
          try { process.kill(pid, 0); running = true; } catch { /* match installed lock behavior */ }
        }
        if (!running && (pid > 0 || attempt >= 2)) {
          unlinkSync(path);
          continue;
        }
      } catch { /* another writer may still be creating its token */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!acquired) throw new Error(`Failed to acquire lock: ${path}`);
  try { return await action(); } finally {
    try {
      if (readFileSync(path, "utf8") === token) unlinkSync(path);
    } catch { /* another owner may have reclaimed its lock */ }
  }
}

/** Never call this without a lead-issued exact-call approval and child receipt. */
export async function commitTeamTaskMutation(request: TaskCommitRequest): Promise<TaskCommit> {
  const { disk, expected, mutation, member } = request;
  try {
    validate(mutation);
    if (!request.approvedDigest || request.digest(mutation) !== request.approvedDigest) {
      return { ok: false, reason: "Exact task call approval is absent or changed" };
    }
    return await lock(expected.lockPath, async () => {
      const latest = resolveTaskDiskCandidate(disk);
      if (!latest.ok) return { ok: false, reason: latest.reason, conflict: true };
      if (latest.path !== expected.path || latest.configFingerprint !== expected.configFingerprint ||
          latest.storeFingerprint !== expected.storeFingerprint) {
        return { ok: false, reason: "Task list changed since approval; request a new approval", conflict: true };
      }
      if (request.digest(mutation) !== request.approvedDigest) {
        return { ok: false, reason: "Task arguments changed before commit" };
      }
      const applied = applyMutation(latest, mutation, member.name);
      const hookInput = Object.freeze({
        toolName: mutation.toolName, args: Object.freeze(structuredClone(mutation.args)),
        memberId: member.id, memberEpoch: member.epoch,
      });
      for (const veto of request.vetoes) {
        const reason = await veto(hookInput);
        if (reason !== undefined) {
          return { ok: false, reason: `Pre-commit hook veto: ${reason || "denied"}` };
        }
      }
      if (request.digest(mutation) !== request.approvedDigest) {
        return { ok: false, reason: "Task arguments changed during pre-commit hook" };
      }
      const tmpPath = `${latest.path}.tmp`;
      mkdirSync(dirname(latest.path), { recursive: true });
      writeFileSync(tmpPath, JSON.stringify({
        nextId: applied.nextId, tasks: applied.tasks,
      }, null, 2));
      renameSync(tmpPath, latest.path);
      const after = resolveTaskDiskCandidate(disk);
      if (!after.ok || after.path !== expected.path) {
        return { ok: false, reason: "Task committed but post-write check failed; start a fresh team session before retry",
          committed: true };
      }
      return {
        ok: true, task: applied.task, changedFields: applied.changedFields,
        warnings: applied.warnings, candidate: after,
      };
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
