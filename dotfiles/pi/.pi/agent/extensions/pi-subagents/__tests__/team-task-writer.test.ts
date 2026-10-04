import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTaskDiskCandidate, type DiskTask, type TaskDiskInputs } from "../tasks/disk-policy.ts";
import { commitTeamTaskMutation, type TeamTaskMutation } from "../teams/task-writer.ts";

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

function diskTask(id: string, fields: Partial<DiskTask> = {}): DiskTask {
  return {
    id, subject: `Task ${id}`, description: "Test task", status: "pending",
    metadata: {}, blocks: [], blockedBy: [], createdAt: 1, updatedAt: 1,
    ...fields,
  };
}

test("candidate updates cannot leave completed tasks with incomplete blockers", async (t) => {
  const cases = [
    {
      name: "completion with a new pending blocker",
      tasks: [diskTask("1"), diskTask("2")],
      args: { taskId: "1", status: "completed", addBlockedBy: ["2"] },
    },
    {
      name: "completion with a new in-progress blocker",
      tasks: [diskTask("1"), diskTask("2", { status: "in_progress" })],
      args: { taskId: "1", status: "completed", addBlockedBy: ["2"] },
    },
    {
      name: "completion with an existing pending blocker",
      tasks: [diskTask("1", { blockedBy: ["2"] }), diskTask("2", { blocks: ["1"] })],
      args: { taskId: "1", status: "completed" },
    },
    {
      name: "new blocker on an already completed task",
      tasks: [diskTask("1", { status: "completed" }), diskTask("2")],
      args: { taskId: "1", addBlockedBy: ["2"] },
    },
    {
      name: "reverse edge from a pending task to a completed task",
      tasks: [diskTask("1"), diskTask("2", { status: "completed" })],
      args: { taskId: "1", addBlocks: ["2"] },
    },
    {
      name: "reopening a blocker of a completed task",
      tasks: [
        diskTask("1", { status: "completed", blocks: ["2"] }),
        diskTask("2", { status: "completed", blockedBy: ["1"] }),
      ],
      args: { taskId: "1", status: "pending" },
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await fixture(async (disk, path) => {
        const original = JSON.stringify({ nextId: 3, tasks: scenario.tasks });
        writeFileSync(path, original);
        const mutation: TeamTaskMutation = { toolName: "TaskUpdate", args: scenario.args };
        const expected = candidate(disk);
        let vetoCalled = false;
        const result = await commitTeamTaskMutation({
          disk, expected, mutation, member: { id: "alice", name: "Alice", epoch: 1 },
          approvedDigest: digest(mutation), digest,
          vetoes: [() => { vetoCalled = true; return undefined; }],
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.match(result.reason, /incomplete blockers/);
        assert.equal(vetoCalled, false, "invalid candidates must fail before pre-commit hooks");
        assert.equal(readFileSync(path, "utf8"), original, "rejected updates must not change the task envelope");
        assert.deepEqual(expected.tasks, scenario.tasks, "validation must not mutate the approved graph");
        assert.equal(existsSync(path + ".tmp"), false);
      });
    });
  }
});

test("completion checks agent cascades after applying dependency updates", async (t) => {
  for (const existingEdge of [false, true]) {
    await t.test(existingEdge ? "existing dependent" : "new dependent", async () => {
      await fixture(async (disk, path) => {
        const original = JSON.stringify({ nextId: 3, tasks: [
          diskTask("1", { blocks: existingEdge ? ["2"] : [] }),
          diskTask("2", { blockedBy: existingEdge ? ["1"] : [], metadata: { agentType: "general-purpose" } }),
        ] });
        writeFileSync(path, original);
        const mutation: TeamTaskMutation = { toolName: "TaskUpdate", args: {
          taskId: "1", status: "completed", addBlocks: ["2"],
        } };
        const result = await commitTeamTaskMutation({
          disk, expected: candidate(disk), mutation, member: { id: "alice", name: "Alice", epoch: 1 },
          approvedDigest: digest(mutation), digest, vetoes: [],
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.match(result.reason, /auto-cascade an agent task/);
        assert.equal(readFileSync(path, "utf8"), original);
      });
    });
  }
});

test("valid combined completion and dependency updates preserve reciprocal edges", async () => {
  await fixture(async (disk, path) => {
    writeFileSync(path, JSON.stringify({ nextId: 4, tasks: [
      diskTask("1", { status: "completed" }), diskTask("2"), diskTask("3"),
    ] }));
    const mutation: TeamTaskMutation = { toolName: "TaskUpdate", args: {
      taskId: "2", status: "completed", owner: "Alice", metadata: { reviewed: true },
      addBlockedBy: ["1", "1"], addBlocks: ["3", "3"],
    } };
    const result = await commitTeamTaskMutation({
      disk, expected: candidate(disk), mutation, member: { id: "alice", name: "Alice", epoch: 1 },
      approvedDigest: digest(mutation), digest, vetoes: [],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.changedFields, ["status", "owner", "metadata", "blocks", "blockedBy"]);
    const persisted = candidate(disk);
    assert.equal(persisted.nextId, 4);
    assert.deepEqual(persisted.tasks.map(({ id, status, blocks, blockedBy }) =>
      ({ id, status, blocks, blockedBy })), [
      { id: "1", status: "completed", blocks: ["2"], blockedBy: [] },
      { id: "2", status: "completed", blocks: ["3"], blockedBy: ["1"] },
      { id: "3", status: "pending", blocks: [], blockedBy: ["2"] },
    ]);
    assert.equal(persisted.tasks[1].owner, "Alice");
    assert.deepEqual(persisted.tasks[1].metadata, { reviewed: true });
    assert.deepEqual(result.task, persisted.tasks[1]);
    assert.deepEqual(result.candidate, persisted);
  });
});

test("reopening a task can add an incomplete blocker to its pending candidate", async () => {
  await fixture(async (disk, path) => {
    writeFileSync(path, JSON.stringify({ nextId: 3, tasks: [
      diskTask("1", { status: "completed" }), diskTask("2"),
    ] }));
    const mutation: TeamTaskMutation = { toolName: "TaskUpdate", args: {
      taskId: "1", status: "pending", addBlockedBy: ["2"],
    } };
    const result = await commitTeamTaskMutation({
      disk, expected: candidate(disk), mutation, member: { id: "alice", name: "Alice", epoch: 1 },
      approvedDigest: digest(mutation), digest, vetoes: [],
    });
    assert.equal(result.ok, true);
    const persisted = candidate(disk);
    assert.equal(persisted.tasks[0].status, "pending");
    assert.deepEqual(persisted.tasks[0].blockedBy, ["2"]);
    assert.deepEqual(persisted.tasks[1].blocks, ["1"]);
  });
});

test("candidate dependency updates still reject cycles and invalid edges atomically", async (t) => {
  const cases = [
    { name: "cycle", args: { addBlockedBy: ["2"], addBlocks: ["2"] }, reason: /dependency cycle/ },
    { name: "missing target", args: { addBlockedBy: ["2", "3"] }, reason: /Invalid dependency edge/ },
    { name: "self edge", args: { addBlocks: ["2", "1"] }, reason: /Invalid dependency edge/ },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await fixture(async (disk, path) => {
        const original = JSON.stringify({ nextId: 3, tasks: [diskTask("1"), diskTask("2")] });
        writeFileSync(path, original);
        const mutation: TeamTaskMutation = { toolName: "TaskUpdate", args: {
          taskId: "1", ...scenario.args,
        } };
        const result = await commitTeamTaskMutation({
          disk, expected: candidate(disk), mutation, member: { id: "alice", name: "Alice", epoch: 1 },
          approvedDigest: digest(mutation), digest, vetoes: [],
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.match(result.reason, scenario.reason);
        assert.equal(readFileSync(path, "utf8"), original);
      });
    });
  }
});

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
