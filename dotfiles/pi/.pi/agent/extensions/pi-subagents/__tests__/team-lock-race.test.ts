import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createTeamTransport } from "../teams/transport.ts";

interface RaceEvent {
  phase: string;
  pid?: number;
  result?: { ok: boolean; conflict?: boolean };
}

interface Worker {
  child: ChildProcess;
  exited: Promise<void>;
  stderr: () => string;
}

for (const mode of ["tasks", "transport"] as const) {
  test(`${mode}: competing stale reclaimers never overlap or lose a committed envelope`, { timeout: 20_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "pi-team-lock-race-"));
    const children: Worker[] = [];
    function events(role: string): RaceEvent[] {
      const path = join(root, `${role}.events`);
      return existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    }
    async function until(role: string, phases: string[]): Promise<RaceEvent> {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const current = events(role);
        assert.ok(!current.some(({ phase }) => phase === "overlap" || phase === "error"), JSON.stringify(current));
        const event = current.find(({ phase }) => phases.includes(phase));
        if (event) return event;
        await delay(10);
      }
      throw new Error(`Waiting for ${role} ${phases.join("/")}:\n${JSON.stringify(events(role))}`);
    }
    const release = (name: string) => writeFileSync(join(root, name), "");
    const cwd = join(root, "cwd");
    const agentDir = join(root, "agent");
    const tasks = join(root, "tasks.json");
    const directory = join(root, "team");
    const lead = { sessionId: "lead", epoch: "epoch", token: "secret" };
    const lockPath = mode === "tasks" ? `${tasks}.lock` : join(directory, "main", "roster.json.lock");
    // Use a real, reaped PID rather than assuming an arbitrary PID is absent.
    const exited = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
    assert.equal(exited.status, 0, exited.stderr);
    const stalePid = exited.pid;
    assert.throws(() => process.kill(stalePid, 0), { code: "ESRCH" });
    function start(role: "first" | "second"): Worker {
      const child = spawn(process.execPath, [new URL("./fixtures/team-lock-race-worker.ts", import.meta.url).pathname,
        JSON.stringify({
          root, role, mode, stalePid,
          disk: { cwd, agentDir, sessionId: role, sessionFile: join(root, `${role}.jsonl`), piTasks: tasks },
        }),
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
      const entry = { child, exited, stderr: () => stderr };
      children.push(entry);
      return entry;
    }
    try {
      mkdirSync(cwd);
      mkdirSync(agentDir);
      writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
      writeFileSync(tasks, JSON.stringify({ nextId: 2, tasks: [
        { id: "1", subject: "Existing history", description: "Keep", status: "completed" },
      ] }));
      if (mode === "transport") await createTeamTransport({ directory, lead }).createTeam("main");
      const stale = `${stalePid}:abandoned`;
      writeFileSync(lockPath, stale, { mode: 0o600 });
      const first = start("first");
      await until("first", ["stale-observed"]);
      const second = start("second");
      assert.equal((await until("second", ["waiting", "entered"])).phase, "waiting",
        "a second reclaimer must not replace the lock during the first stale observation");
      assert.equal(readFileSync(lockPath, "utf8"), stale);
      release("release-stale");
      await until("first", ["entered"]);
      release("allow-second-retry");
      assert.equal((await until("second", ["live-probed"])).pid, first.child.pid);
      const owned = readFileSync(lockPath, "utf8");
      assert.ok(owned.startsWith(`${first.child.pid}:`));
      assert.ok(!events("second").some(({ phase }) => phase === "entered" || phase === "result"),
        "the replacement owner retains its critical section throughout the veto/write delay");
      assert.equal(readFileSync(lockPath, "utf8"), owned);
      release("release-first");
      assert.equal((await until("first", ["result"])).result?.ok, true);
      if (mode === "tasks") {
        assert.deepEqual((await until("second", ["result"])).result, {
          ok: false, reason: "Task list changed since approval; request a new approval", conflict: true,
        });
        const beforeRetry = JSON.parse(readFileSync(tasks, "utf8"));
        assert.deepEqual(beforeRetry.tasks.map((task: { subject: string }) => task.subject), ["Existing history", "first"]);
        release("retry"); // Explicit fresh approval, never an automatic stale-call retry.
      }
      await until("second", ["entered"]);
      release("release-second");
      assert.equal((await until("second", [mode === "tasks" ? "retried" : "result"])).result?.ok, true);
      for (const entry of children) {
        await entry.exited;
        assert.equal(entry.child.exitCode, 0, entry.stderr());
      }
      assert.equal(existsSync(lockPath), false);
      assert.equal(existsSync(`${lockPath}.reclaim`), false);
      assert.equal(existsSync(join(root, "critical")), false);
      for (const role of ["first", "second"]) {
        assert.ok(!events(role).some(({ phase }) => phase === "overlap" || phase === "error"));
      }
      if (mode === "tasks") {
        const envelope = JSON.parse(readFileSync(tasks, "utf8"));
        assert.equal(envelope.nextId, 4);
        assert.deepEqual(envelope.tasks.map((task: { id: string; subject: string; status: string }) =>
          [task.id, task.subject, task.status]), [
          ["1", "Existing history", "completed"], ["2", "first", "pending"], ["3", "second", "pending"],
        ]);
      } else {
        const members = await createTeamTransport({ directory, lead }).listMembers("main");
        assert.deepEqual(members.map(({ memberId }) => memberId), ["first", "second"]);
      }
    } finally {
      for (const entry of children) {
        if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill("SIGKILL");
        await entry.exited;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
}
