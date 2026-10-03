import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export interface SessionEntry {
  type: string;
  id: string;
  parentId?: string | null;
  [key: string]: unknown;
}

export interface MessageEntry extends SessionEntry {
  type: "message";
  message: {
    role: "user" | "assistant" | "toolResult";
    content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  };
}

export type SeededSubagentSessionMode = "lineage-only" | "fork";

function getForkContentLines(
  parentSessionFile: string,
  parentLeafId?: string | null,
): string[] {
  const raw = readFileSync(parentSessionFile, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim());
  const byId = new Map<string, { entry: SessionEntry; line: string }>();
  let lastEntryId: string | null = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as SessionEntry;
      if (!entry || entry.type === "session" || typeof entry.id !== "string") continue;
      byId.set(entry.id, { entry, line });
      lastEntryId = entry.id;
    } catch {
      // ignore malformed lines
    }
  }

  // Navigation can move the live leaf without appending to the file. File-only
  // callers use the last persisted entry, but still inherit only its ancestry.
  let currentId = parentLeafId === undefined ? lastEntryId : parentLeafId;
  const branch: Array<{ entry: SessionEntry; line: string }> = [];
  const visited = new Set<string>();
  while (currentId !== null) {
    if (visited.has(currentId)) throw new Error(`Cycle in fork ancestry at ${currentId}`);
    const record = byId.get(currentId);
    if (!record) throw new Error(`Missing fork ancestor ${currentId}`);
    visited.add(currentId);
    branch.push(record);
    currentId = record.entry.parentId ?? null;
  }
  branch.reverse();

  let truncateAt = branch.length;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i].entry;
    if (entry.type === "message" && (entry as MessageEntry).message?.role === "user") {
      truncateAt = i;
      break;
    }
  }
  return branch.slice(0, truncateAt).map(({ line }) => line);
}

export function seedSubagentSessionFile(params: {
  mode: SeededSubagentSessionMode;
  parentSessionFile: string;
  parentLeafId?: string | null;
  childSessionFile: string;
  childCwd: string;
  sessionId?: string;
}): void {
  const header = {
    type: "session",
    version: 3,
    id: params.sessionId ?? randomUUID(),
    timestamp: new Date().toISOString(),
    cwd: params.childCwd,
    parentSession: params.parentSessionFile,
  };
  const contentLines =
    params.mode === "fork"
      ? getForkContentLines(params.parentSessionFile, params.parentLeafId)
      : [];
  const lines = [JSON.stringify(header), ...contentLines];

  mkdirSync(dirname(params.childSessionFile), { recursive: true });
  writeFileSync(params.childSessionFile, lines.join("\n") + "\n", "utf8");
}

function readEntries(sessionFile: string): SessionEntry[] {
  const raw = readFileSync(sessionFile, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SessionEntry);
}

/**
 * Return the id of the last entry in the session file (current branch point / leaf).
 */
export function getLeafId(sessionFile: string): string | null {
  const entries = readEntries(sessionFile);
  return entries.length > 0 ? entries[entries.length - 1].id : null;
}

/**
 * Return entries added after `afterLine` (1-indexed count of existing entries).
 */
export function getNewEntries(sessionFile: string, afterLine: number): SessionEntry[] {
  const raw = readFileSync(sessionFile, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim());
  return lines.slice(afterLine).map((line) => JSON.parse(line) as SessionEntry);
}

/**
 * Find the last assistant message text in a list of entries.
 *
 * Falls back to the `errorMessage` field when the last assistant message has
 * `stopReason: "error"` and no usable text content — this happens when
 * auto-retry exhausts on a provider overload / rate limit / server error, and
 * without this fallback the parent would silently see a stale earlier message.
 */
export function findLastAssistantMessage(entries: SessionEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message") continue;
    const msg = entry as MessageEntry;
    if (msg.message.role !== "assistant") continue;

    const texts = msg.message.content
      .filter(
        (block) =>
          block.type === "text" && typeof block.text === "string" && block.text.trim() !== "",
      )
      .map((block) => block.text as string);

    if (texts.length > 0 && texts.join("").trim()) return texts.join("\n");

    const stopReason = (msg.message as { stopReason?: unknown }).stopReason;
    const errorMessage = (msg.message as { errorMessage?: unknown }).errorMessage;
    if (
      stopReason === "error" &&
      typeof errorMessage === "string" &&
      errorMessage.trim() !== ""
    ) {
      return `Subagent error: ${errorMessage.trim()}`;
    }
  }
  return null;
}

/**
 * An interactive workflow role can finish its answer, then receive a short
 * "go" before it calls subagent_done. Keep that final answer in the result
 * without discarding any newer completion note.
 */
export function findWorkflowCompletionMessage(entries: SessionEntry[]): string | null {
  const latest = findLastAssistantMessage(entries);
  if (!latest) return null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message") continue;
    const message = (entry as MessageEntry).message;
    if (message.role !== "assistant" || (message as { stopReason?: string }).stopReason !== "stop") continue;
    const final = message.content
      .filter((block) => block.type === "text" && typeof block.text === "string" && block.text.trim())
      .map((block) => block.text)
      .join("\n");
    if (final) return final === latest ? final : `${final}\n\nCompletion note: ${latest}`;
  }
  return latest;
}

/**
 * Append a branch_summary entry to the session file.
 * Returns the new entry's id.
 */
export function appendBranchSummary(
  sessionFile: string,
  branchPointId: string,
  fromId: string | null,
  summary: string,
): string {
  const id = randomBytes(4).toString("hex");
  const entry = {
    type: "branch_summary",
    id,
    parentId: branchPointId,
    timestamp: new Date().toISOString(),
    fromId: fromId ?? branchPointId,
    summary,
  };
  appendFileSync(sessionFile, JSON.stringify(entry) + "\n", "utf8");
  return id;
}

/**
 * Copy the session file to destDir for parallel worker isolation.
 * Returns the path of the copy.
 */
export function copySessionFile(sessionFile: string, destDir: string): string {
  const id = randomBytes(4).toString("hex");
  const dest = join(destDir, `subagent-${id}.jsonl`);
  copyFileSync(sessionFile, dest);
  return dest;
}

/**
 * Read new entries from sourceFile (after afterLine), append them to targetFile.
 * Returns the appended entries.
 */
export function mergeNewEntries(
  sourceFile: string,
  targetFile: string,
  afterLine: number,
): SessionEntry[] {
  const entries = getNewEntries(sourceFile, afterLine);
  for (const entry of entries) {
    appendFileSync(targetFile, JSON.stringify(entry) + "\n", "utf8");
  }
  return entries;
}
