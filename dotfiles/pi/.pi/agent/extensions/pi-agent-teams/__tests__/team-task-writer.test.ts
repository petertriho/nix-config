import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTaskDiskCandidate, type TaskDiskInputs } from "../task-disk-policy.ts";
import { commitTeamTaskMutation, type TeamTaskMutation } from "../team-task-writer.ts";

const digest = (call: TeamTaskMutation): string =>
  createHash("sha256").update(JSON.stringify(call)).digest("hex");

function fixture(run: (disk: TaskDiskInputs, path: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pi-team-writer-"));
  const cwd = join(root, "cwd");
  const agentDir = join(root, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
  const path = join(root, "tasks.json");
  const disk = { cwd, agentDir, sessionId: "member1", sessionFile: join(root, "session.jsonl"), piTasks: path };
  return run(disk, path).finally(() => rmSync(root, { recursive: true, force: true }));
}

function candidate(disk: TaskDiskInputs) {
  const result = resolveTaskDiskCandidate(disk);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

test("conditional task writes preserve legacy completed history and monotonic IDs", async () => {
  await fixture(async (disk, path) => {
    writeFileSync(path, JSON.stringify({ tasks: [
      { id: "6", subject: "Keep", description: "Past", status: "completed", blocks: ["7"] },
      { id: "7", subject: "Next", description: "Pending", status: "pending", blockedBy: ["6"] },
    ] }));
    const create: TeamTaskMutation = { toolName: "TaskCreate", args: {
      subject: "Review", description: "Check", activeForm: "Reviewing",
    } };
    const created = await commitTeamTaskMutation({
      disk, expected: candidate(disk), mutation: create, member: { id: "alice", name: "Alice", epoch: 1 },
      approvedDigest: digest(create), digest, vetoes: [],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.task?.id, "8");
    const update: TeamTaskMutation = { toolName: "TaskUpdate", args: {
      taskId: "8", owner: "Alice", status: "in_progress", addBlockedBy: ["7"],
    } };
    const updated = await commitTeamTaskMutation({
      disk, expected: created.candidate, mutation: update, member: { id: "alice", name: "Alice", epoch: 1 },
      approvedDigest: digest(update), digest, vetoes: [],
    });
    assert.equal(updated.ok, true);
    const persisted = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(persisted.nextId, 9);
    assert.deepEqual(persisted.tasks.map((task: { id: string }) => task.id), ["6", "7", "8"]);
    assert.equal(persisted.tasks[0].status, "completed");
    assert.deepEqual(persisted.tasks[0].blocks, ["7"]);
    assert.deepEqual(persisted.tasks[1].blockedBy, ["6"]);
    assert.deepEqual(persisted.tasks[1].blocks, ["8"]);
    assert.deepEqual(persisted.tasks[2].blockedBy, ["7"]);
    assert.deepEqual(persisted.tasks[0].metadata, {});
  });
});

test("missing approval, veto and out-of-band changes prevent team commits", async () => {
  await fixture(async (disk, path) => {
    const create: TeamTaskMutation = { toolName: "TaskCreate", args: { subject: "A", description: "B" } };
    const original = candidate(disk);
    const base = {
      disk, expected: original, mutation: create, member: { id: "alice", name: "Alice", epoch: 1 },
      digest, vetoes: [],
    };
    assert.equal((await commitTeamTaskMutation({ ...base, approvedDigest: "" })).ok, false);
    const calls: string[] = [];
    const veto = await commitTeamTaskMutation({
      ...base, approvedDigest: digest(create), vetoes: [async () => {
        calls.push("veto"); return "blocked by policy";
      }],
    });
    assert.equal(veto.ok, false);
    assert.deepEqual(calls, ["veto"]);
    assert.equal(existsSync(path), false, "refused writes do not create the task file");
  });
});

test("an independent process writer wins under the same lock and invalidates the approved fingerprint", async () => {
  await fixture(async (disk, path) => {
    const create: TeamTaskMutation = { toolName: "TaskCreate", args: { subject: "A", description: "B" } };
    const expected = candidate(disk);
    const child = spawnSync(process.execPath, ["-e", `
      const fs = require("node:fs");
      const lock = ${JSON.stringify(path + ".lock")};
      fs.writeFileSync(lock, process.pid + ":external", { flag: "wx" });
      try {
        fs.writeFileSync(${JSON.stringify(path + ".tmp")}, JSON.stringify({
          nextId: 2, tasks: [{ id: "1", subject: "Native", description: "Other process",
            status: "completed", metadata: {}, blocks: [], blockedBy: [], createdAt: 1, updatedAt: 1 }]
        }));
        fs.renameSync(${JSON.stringify(path + ".tmp")}, ${JSON.stringify(path)});
      } finally { fs.unlinkSync(lock); }
    `], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const rejected = await commitTeamTaskMutation({
      disk, expected, mutation: create, member: { id: "alice", name: "Alice", epoch: 1 },
      approvedDigest: digest(create), digest, vetoes: [],
    });
    assert.deepEqual(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.conflict, true);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).tasks.map((task: { id: string }) => task.id), ["1"]);
  });
});
