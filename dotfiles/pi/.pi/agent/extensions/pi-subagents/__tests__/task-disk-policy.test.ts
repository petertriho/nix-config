import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTaskDiskCandidate as deriveCandidate, type TaskDiskInputs } from "../tasks/disk-policy.ts";

const session = { sessionId: "session-1", sessionFile: "/tmp/persistent-session-1.jsonl" };
const resolveTaskDiskCandidate = (input: TaskDiskInputs) => deriveCandidate({ ...session, ...input });

test("derived disk candidate honors project mode and session-global existing workspace preference without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-disk-"));
  try {
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    const homeDir = join(root, "home");
    mkdirSync(join(cwd, ".pi", "tasks"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "tasks-config.json"), JSON.stringify({
      taskScope: "project", autoClearCompleted: "on_task_complete",
    }));
    writeFileSync(join(cwd, ".pi", "tasks-config.json"), JSON.stringify({
      taskScope: "session-global", autoClearCompleted: "never",
    }));
    const workspaceFile = join(cwd, ".pi", "tasks", "tasks-session-1.json");
    writeFileSync(workspaceFile, JSON.stringify({ nextId: 1, tasks: [] }));
    const candidate = resolveTaskDiskCandidate({
      cwd, agentDir, homeDir, sessionId: "session-1",
      sessionFile: join(agentDir, "sessions", "session-1.jsonl"),
    });
    assert.equal(candidate.ok, true);
    if (!candidate.ok) return;
    assert.equal(candidate.path, workspaceFile);
    assert.equal(candidate.lockPath, workspaceFile + ".lock");
    assert.equal(candidate.taskScope, "session-global");
    assert.equal(candidate.nextId, 1);
    assert.deepEqual(candidate.tasks, []);
    assert.equal(existsSync(workspaceFile + ".lock"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy completed task and dependencies survive load normalization and counter repair", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-legacy-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    mkdirSync(join(cwd, ".pi", "tasks"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(cwd, ".pi", "tasks-config.json"), JSON.stringify({
      taskScope: "project", autoClearCompleted: "never",
    }));
    writeFileSync(join(cwd, ".pi", "tasks", "tasks.json"), JSON.stringify({
      nextId: 1, tasks: [
        { id: "3", subject: "Retain", description: "Old", status: "completed",
          blocks: ["5"], metadata: [], label: "historical" },
        { id: "5", subject: "Wait", description: "Next", status: "pending", blockedBy: ["3"] },
      ],
    }));
    const before = Date.now();
    const result = resolveTaskDiskCandidate({ cwd, agentDir, ...session });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.nextId, 6);
    assert.deepEqual(result.tasks.map((task) => task.id), ["3", "5"]);
    assert.equal(result.tasks[0].status, "completed");
    assert.equal(result.tasks[0].label, "historical");
    assert.deepEqual(result.tasks[0].metadata, {});
    assert.deepEqual(result.tasks[0].blocks, ["5"]);
    assert.deepEqual(result.tasks[0].blockedBy, []);
    assert.deepEqual(result.tasks[1].blocks, []);
    assert.deepEqual(result.tasks[1].blockedBy, ["3"]);
    assert.ok(result.tasks[0].createdAt >= before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lossy task envelope is refused instead of silently discarding history", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-lossy-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    mkdirSync(join(cwd, ".pi", "tasks"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(cwd, ".pi", "tasks-config.json"), '{"taskScope":"project","autoClearCompleted":"never"}');
    const path = join(cwd, ".pi", "tasks", "tasks.json");
    const oldTask = { id: "2", subject: "Past", description: "Keep", status: "completed" };
    for (const tasks of [
      [oldTask, { ...oldTask, subject: "Duplicate" }],
      [oldTask, { subject: "Missing identity" }],
      [{ ...oldTask, blocks: ["absent"] }],
    ]) {
      writeFileSync(path, JSON.stringify({ nextId: 3, tasks }));
      const result = resolveTaskDiskCandidate({ cwd, agentDir });
      assert.equal(result.ok, false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("absolute/relative/named overrides match the captured upstream path rules", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-override-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    const homeDir = join(root, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
    const expected = [
      [join(root, "absolute.json"), join(root, "absolute.json")],
      ["./relative.json", join(cwd, "relative.json")],
      ["shared", join(homeDir, ".pi", "tasks", "shared.json")],
      ["shared.team", join(homeDir, ".pi", "tasks", "shared.team.json")],
    ];
    for (const [piTasks, path] of expected) {
      const result = resolveTaskDiskCandidate({ cwd, agentDir, homeDir, piTasks });
      assert.equal(result.ok, true, `${piTasks}: ${result.ok ? "" : result.reason}`);
      if (result.ok) assert.equal(result.path, path);
      assert.equal(existsSync(path), false);
    }
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir, piTasks: "off" }).ok, false);
    assert.equal(deriveCandidate({ cwd, agentDir, piTasks: expected[0][0] }).ok, false);
    assert.equal(deriveCandidate({ cwd, agentDir }).ok, false);
    writeFileSync(join(agentDir, "tasks-config.json"), '{"taskScope":"memory","autoClearCompleted":"never"}');
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir }).ok, false);
    for (const [piTasks, path] of expected) {
      const result = resolveTaskDiskCandidate({ cwd, agentDir, homeDir, piTasks });
      assert.equal(result.ok, true, `${piTasks}: ${result.ok ? "" : result.reason}`);
      if (result.ok) assert.equal(result.path, path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ambiguous symlink task targets and unreadable configurations fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-unsafe-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    const config = join(cwd, ".pi", "tasks-config.json");
    writeFileSync(config, '{"autoClearCompleted":"never"}');
    const actual = join(root, "real.json");
    writeFileSync(actual, '{"nextId":1,"tasks":[]}');
    const alias = join(root, "alias.json");
    symlinkSync(actual, alias);
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir, piTasks: alias }).ok, false);
    writeFileSync(config, "{broken");
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir, piTasks: actual }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Home Manager configuration links are readable, but dangling links and linked task targets are refused", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-config-link-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    const configSource = join(root, "source.json");
    writeFileSync(configSource, '{"autoClearCompleted":"never"}');
    symlinkSync(configSource, join(agentDir, "tasks-config.json"));
    const input = { cwd, agentDir, ...session };
    const allowed = resolveTaskDiskCandidate(input);
    assert.equal(allowed.ok, true, allowed.ok ? "" : allowed.reason);
    const actual = join(root, "tasks.json");
    writeFileSync(actual, '{"nextId":1,"tasks":[]}');
    const alias = join(root, "linked-tasks.json");
    symlinkSync(actual, alias);
    assert.equal(resolveTaskDiskCandidate({ ...input, piTasks: alias }).ok, false);
    unlinkSync(configSource);
    const dangling = resolveTaskDiskCandidate(input);
    assert.equal(dangling.ok, false);
    assert.match(dangling.reason, /dangling task configuration link/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("point-in-time disk checks cannot attest a different live store, cached mode, or restored config", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-false-green-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    const config = join(cwd, ".pi", "tasks-config.json");
    writeFileSync(config, '{"autoClearCompleted":"on_list_complete"}');
    // Model the factory's captured configuration before the user changes the
    // file. The resolver cannot inspect or refresh this private factory state.
    const nativeFactory = {
      storePath: join(root, "active.json"),
      loadedMode: JSON.parse(readFileSync(config, "utf8")).autoClearCompleted as string,
      readTasks(): Array<{ id: string; status: string }> {
        return JSON.parse(readFileSync(this.storePath, "utf8")).tasks;
      },
      startNewBatch(): void {
        if (this.loadedMode !== "never" && this.readTasks().every((task) => task.status === "completed")) {
          writeFileSync(this.storePath, '{"nextId":2,"tasks":[]}');
        }
      },
    };
    const diskMode = '{"autoClearCompleted":"never"}';
    writeFileSync(config, diskMode);
    const target = join(root, "derived.json");
    const identicalRecord = '{"nextId":2,"tasks":[{"id":"1","subject":"Past","description":"Keep","status":"completed"}]}';
    writeFileSync(target, identicalRecord);
    writeFileSync(nativeFactory.storePath, identicalRecord);
    const inputs = { cwd, agentDir, piTasks: target };
    const first = resolveTaskDiskCandidate(inputs);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.deepEqual(first.tasks.map((task) => task.id), nativeFactory.readTasks().map((task) => task.id));
    assert.notEqual(nativeFactory.storePath, first.path, "matching native reads cannot prove store identity");
    assert.equal(nativeFactory.loadedMode, "on_list_complete", "disk never did not reload the factory");
    nativeFactory.startNewBatch();
    assert.deepEqual(nativeFactory.readTasks(), [], "a stale native mode can irreversibly clear completed history");
    const afterClear = resolveTaskDiskCandidate(inputs);
    assert.equal(afterClear.ok, true, "the derived file remains green after native history loss");
    if (afterClear.ok) assert.equal(afterClear.storeFingerprint, first.storeFingerprint);
    // A write then restore between checks is undetectable by derived snapshots.
    writeFileSync(config, '{"autoClearCompleted":"on_task_complete"}');
    assert.equal(resolveTaskDiskCandidate(inputs).ok, false);
    writeFileSync(config, diskMode);
    const restored = resolveTaskDiskCandidate(inputs);
    assert.equal(restored.ok, true);
    if (restored.ok) {
      assert.equal(first.configFingerprint, restored.configFingerprint);
      assert.equal(first.storeFingerprint, restored.storeFingerprint);
    }
    // An independent writer can likewise change and restore the store between
    // checks. Equal point-in-time fingerprints are not proof of no writes.
    writeFileSync(target, '{"nextId":1,"tasks":[]}');
    writeFileSync(target, identicalRecord);
    const afterExternalWrite = resolveTaskDiskCandidate(inputs);
    assert.equal(afterExternalWrite.ok, true);
    if (afterExternalWrite.ok) assert.equal(afterExternalWrite.storeFingerprint, first.storeFingerprint);
    // An empty list offers no distinctive native read to cross-check.
    writeFileSync(target, '{"nextId":1,"tasks":[]}');
    const empty = resolveTaskDiskCandidate(inputs);
    assert.equal(empty.ok, true);
    if (empty.ok) assert.equal(empty.tasks.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-global uses agent-dir key when no workspace file exists, but refuses nonpersistent sessions", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-global-"));
  try {
    const cwd = join(root, "repo", "sub");
    const agentDir = join(root, "custom-agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "tasks-config.json"), '{"taskScope":"session-global","autoClearCompleted":"never"}');
    const inputs = { cwd, agentDir, sessionId: "sess-2", sessionFile: join(agentDir, "sessions", "sess-2.jsonl") };
    const result = resolveTaskDiskCandidate(inputs);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.path, join(agentDir, "tasks", "sessions", "--" + cwd.slice(1).replaceAll("/", "-") + "--", "tasks-sess-2.json"));
      assert.equal(existsSync(result.path), false);
    }
    assert.equal(resolveTaskDiskCandidate({ ...inputs, sessionFile: undefined }).ok, false);
    assert.equal(resolveTaskDiskCandidate({ ...inputs, sessionId: undefined }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("each child cwd and agent dir derives its own effective mode and config fingerprint", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-child-config-"));
  try {
    const cwd = join(root, "lead");
    const childCwd = join(root, "child");
    const agentDir = join(root, "lead-agent");
    const childAgentDir = join(root, "child-agent");
    for (const path of [cwd, childCwd, agentDir, childAgentDir]) mkdirSync(path, { recursive: true });
    writeFileSync(join(agentDir, "tasks-config.json"), '{"taskScope":"project","autoClearCompleted":"never"}');
    const lead = resolveTaskDiskCandidate({ cwd, agentDir });
    assert.equal(lead.ok, true);
    assert.equal(resolveTaskDiskCandidate({ cwd: childCwd, agentDir: childAgentDir }).ok, false);
    writeFileSync(join(childAgentDir, "tasks-config.json"), '{"taskScope":"project","autoClearCompleted":"never"}');
    const child = resolveTaskDiskCandidate({ cwd: childCwd, agentDir: childAgentDir });
    assert.equal(child.ok, true);
    if (lead.ok && child.ok) {
      assert.notEqual(lead.path, child.path);
      assert.notEqual(lead.configFingerprint, child.configFingerprint);
    }
    // A child project override takes precedence even over a safe global setting.
    mkdirSync(join(childCwd, ".pi"));
    writeFileSync(join(childCwd, ".pi", "tasks-config.json"), '{"autoClearCompleted":"on_list_complete"}');
    assert.equal(resolveTaskDiskCandidate({ cwd: childCwd, agentDir: childAgentDir }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("upstream optional-field normalization repairs old counters but preserves larger valid counters", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-task-counter-"));
  try {
    const cwd = join(root, "work");
    const agentDir = join(root, "agent");
    mkdirSync(join(cwd, ".pi", "tasks"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "tasks-config.json"), '{"taskScope":"project","autoClearCompleted":"never"}');
    const file = join(cwd, ".pi", "tasks", "tasks.json");
    const old = { id: "7", subject: "Completed", description: "Keep it", status: "completed",
      metadata: null, blocks: "wrong", blockedBy: false, createdAt: "old", updatedAt: null };
    for (const [counter, expected] of [[undefined, 8], ["bad", 8], [3, 8], [100, 100]] as const) {
      writeFileSync(file, JSON.stringify({ nextId: counter, tasks: [old] }));
      const result = resolveTaskDiskCandidate({ cwd, agentDir });
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.equal(result.nextId, expected);
      assert.deepEqual(result.tasks[0].metadata, {});
      assert.deepEqual(result.tasks[0].blocks, []);
      assert.deepEqual(result.tasks[0].blockedBy, []);
      assert.equal(typeof result.tasks[0].createdAt, "number");
      assert.equal(typeof result.tasks[0].updatedAt, "number");
    }
    writeFileSync(file, JSON.stringify({ nextId: Number.MAX_SAFE_INTEGER + 1, tasks: [old] }));
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir }).ok, false);
    writeFileSync(file, JSON.stringify({ nextId: Number.MAX_SAFE_INTEGER, tasks: [old] }));
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir }).ok, false);
    writeFileSync(file, JSON.stringify({
      tasks: [{ ...old, id: String(Number.MAX_SAFE_INTEGER - 2) }],
    }));
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir }).ok, false);
    writeFileSync(file, `{"nextId":1e309,"tasks":[${JSON.stringify(old)}]}`);
    assert.equal(resolveTaskDiskCandidate({ cwd, agentDir }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
