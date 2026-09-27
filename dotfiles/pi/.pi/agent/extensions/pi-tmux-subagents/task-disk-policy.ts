import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

export interface TaskDiskInputs {
  cwd: string;
  agentDir: string;
  homeDir?: string;
  sessionId?: string;
  sessionFile?: string;
  /** The value captured in the pi-tasks factory; supply it explicitly per process. */
  piTasks?: string;
}

export interface DiskTask {
  id: string;
  subject: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  metadata: Record<string, unknown>;
  blocks: string[];
  blockedBy: string[];
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export type DiskCandidate =
  | { ok: false; reason: string }
  | {
    ok: true;
    path: string;
    lockPath: string;
    taskScope: "session" | "session-global" | "project" | "memory";
    configFingerprint: string;
    storeFingerprint: string;
    nextId: number;
    tasks: DiskTask[];
  };

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readConfig(path: string): { value: Record<string, unknown>; fingerprint: string } {
  // Home Manager links configuration files. They are read only here; task,
  // lock, and temporary write paths must still have no symbolic links.
  checkPath(path, true);
  if (!existsSync(path)) return { value: {}, fingerprint: digest("ABSENT") };
  const text = readFileSync(path, "utf8");
  const value: unknown = JSON.parse(text);
  if (!record(value)) throw new Error(`Invalid task configuration at ${path}`);
  return { value, fingerprint: digest(text) };
}

/** Refuse symlink aliases except an existing regular-file configuration leaf. */
function checkPath(path: string, allowConfigLeaf = false): void {
  let part = path;
  let nearestParent: string | undefined;
  while (true) {
    try {
      const stat = lstatSync(part);
      if (stat.isSymbolicLink()) {
        if (part !== path || !allowConfigLeaf) throw new Error(`Task path contains a symbolic link: ${part}`);
        try {
          if (!statSync(part).isFile()) throw new Error(`Unsafe task configuration link: ${part}`);
        } catch {
          throw new Error(`Unsafe or dangling task configuration link: ${part}`);
        }
      }
      if (part === path && !stat.isFile() && !(allowConfigLeaf && stat.isSymbolicLink())) {
        throw new Error(`Unsafe task file target: ${part}`);
      }
      if (part !== path && !stat.isDirectory()) throw new Error(`Unsafe parent directory: ${part}`);
      if (part !== path && !nearestParent) nearestParent = part;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (part === parse(part).root) break;
    part = dirname(part);
  }
  if (nearestParent) accessSync(nearestParent, constants.W_OK | constants.X_OK);
}

/** Reject path aliases and unsafe lock/rename targets, without creating a witness file. */
function checkTarget(path: string): void {
  checkPath(path);
  for (const file of [path, path + ".lock", path + ".tmp"]) {
    checkPath(file);
  }
}

/** Mirrors upstream optional-field defaults, but rejects records it would silently discard. */
function normalizeEnvelope(value: unknown): { tasks: DiskTask[]; nextId: number } {
  if (!record(value) || !Array.isArray(value.tasks)) throw new Error("Invalid task envelope");
  const seen = new Set<string>();
  let maxId = 0;
  const now = Date.now();
  const tasks = value.tasks.map((entry: unknown): DiskTask => {
    if (!record(entry) || typeof entry.id !== "string" || !/^[1-9]\d*$/.test(entry.id)) {
      throw new Error("Invalid task ID");
    }
    const numericId = Number(entry.id);
    if (!Number.isSafeInteger(numericId) || numericId >= Number.MAX_SAFE_INTEGER || seen.has(entry.id)) {
      throw new Error("Duplicate or unsafe task ID");
    }
    if (typeof entry.subject !== "string" || typeof entry.description !== "string" ||
        !["pending", "in_progress", "completed"].includes(String(entry.status)) ||
        (entry.owner !== undefined && typeof entry.owner !== "string") ||
        (entry.activeForm !== undefined && typeof entry.activeForm !== "string")) {
      throw new Error(`Invalid task record #${entry.id}`);
    }
    seen.add(entry.id);
    maxId = Math.max(maxId, numericId);
    const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
    const blockedBy = Array.isArray(entry.blockedBy) ? entry.blockedBy : [];
    return {
      ...entry,
      id: entry.id,
      subject: entry.subject,
      description: entry.description,
      status: entry.status as DiskTask["status"],
      metadata: record(entry.metadata) ? entry.metadata : {},
      blocks,
      blockedBy,
      createdAt: typeof entry.createdAt === "number" ? entry.createdAt : now,
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : now,
    };
  });
  for (const task of tasks) {
    for (const id of [...task.blocks, ...task.blockedBy]) {
      if (typeof id !== "string" || !seen.has(id)) throw new Error(`Unsafe dependency edge on #${task.id}`);
    }
  }
  if (typeof value.nextId === "number" &&
      (!Number.isFinite(value.nextId) || value.nextId > Number.MAX_SAFE_INTEGER)) {
    throw new Error("Task counter exceeds safe integer range");
  }
  const nextId = typeof value.nextId === "number" && Number.isSafeInteger(value.nextId) && value.nextId > maxId
    ? value.nextId
    : maxId + 1;
  // A creation must leave a precise, usable successor in the persisted file.
  if (!Number.isSafeInteger(nextId) || nextId > Number.MAX_SAFE_INTEGER - 2) {
    throw new Error("Task counter has no safe successor");
  }
  return { tasks, nextId };
}

function fileFingerprint(path: string, config = false): string {
  checkPath(path, config);
  return digest(existsSync(path) ? readFileSync(path, "utf8") : "ABSENT");
}

export function resolveTaskDiskCandidate(input: TaskDiskInputs): DiskCandidate {
  try {
    if (!isAbsolute(input.cwd) || !isAbsolute(input.agentDir) ||
        !lstatSync(input.cwd).isDirectory() || !lstatSync(input.agentDir).isDirectory()) {
      throw new Error("Existing absolute cwd and agent dir required");
    }
    if (input.homeDir && !isAbsolute(input.homeDir)) throw new Error("Absolute home directory required");
    if (!input.sessionFile || !isAbsolute(input.sessionFile) || !input.sessionId ||
        !/^[a-zA-Z0-9_-]+$/.test(input.sessionId)) {
      throw new Error("Persistent session identity required");
    }
    const globalPath = join(input.agentDir, "tasks-config.json");
    const projectPath = join(input.cwd, ".pi", "tasks-config.json");
    const global = readConfig(globalPath);
    const project = readConfig(projectPath);
    const cfg = { ...global.value, ...project.value };
    if (cfg.autoClearCompleted !== "never") throw new Error('Effective disk autoClearCompleted must be "never"');
    const taskScope = cfg.taskScope ?? "session";
    if (!["session", "session-global", "project", "memory"].includes(String(taskScope))) {
      throw new Error("Invalid task scope");
    }
    if (input.piTasks === "off" || (!input.piTasks && taskScope === "memory")) {
      throw new Error("Task store is nonpersistent");
    }
    let path: string;
    if (input.piTasks) {
      if (isAbsolute(input.piTasks)) path = input.piTasks;
      else if (input.piTasks.startsWith(".")) path = resolve(input.cwd, input.piTasks);
      else {
        if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(input.piTasks)) {
          throw new Error("Unsafe named task override");
        }
        path = join(input.homeDir ?? homedir(), ".pi", "tasks", `${input.piTasks}.json`);
      }
    } else if (taskScope === "project") {
      path = join(input.cwd, ".pi", "tasks", "tasks.json");
    } else {
      const workspace = join(input.cwd, ".pi", "tasks", `tasks-${input.sessionId}.json`);
      const projectKey = `--${resolve(input.cwd).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
      path = taskScope === "session-global" && !existsSync(workspace)
        ? join(input.agentDir, "tasks", "sessions", projectKey, `tasks-${input.sessionId}.json`)
        : workspace;
    }
    checkTarget(path);
    const text = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    const parsed: unknown = text === undefined ? { nextId: 1, tasks: [] } : JSON.parse(text);
    const envelope = normalizeEnvelope(parsed);
    if (fileFingerprint(globalPath, true) !== global.fingerprint ||
        fileFingerprint(projectPath, true) !== project.fingerprint ||
        fileFingerprint(path) !== digest(text ?? "ABSENT")) {
      throw new Error("Task configuration or store changed during disk check");
    }
    return {
      ok: true, path, lockPath: path + ".lock",
      taskScope: taskScope as "session" | "session-global" | "project" | "memory",
      configFingerprint: digest(JSON.stringify([
        input.cwd, input.agentDir, global.fingerprint, project.fingerprint, input.piTasks ?? null,
      ])),
      storeFingerprint: digest(text ?? "ABSENT"),
      nextId: envelope.nextId,
      tasks: envelope.tasks,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
