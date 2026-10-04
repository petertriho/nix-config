// Separate OS process: pause a stale-owner probe and hold real critical sections.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { resolveTaskDiskCandidate, type TaskDiskInputs } from "../../tasks/disk-policy.ts";
import { commitTeamTaskMutation, type TeamTaskMutation } from "../../teams/task-writer.ts";
import { createTeamTransport } from "../../teams/transport.ts";

const input = JSON.parse(process.argv[2]) as {
  root: string; role: "first" | "second"; mode: "tasks" | "transport";
  stalePid: number; disk: TaskDiskInputs;
};
const { root, role, mode, stalePid, disk } = input;
const log = (phase: string, data: Record<string, unknown> = {}) =>
  fs.appendFileSync(join(root, `${role}.events`), `${JSON.stringify({ phase, ...data })}\n`);
const gate = (name: string) => join(root, name);
const waitSync = (name: string) => {
  const deadline = Date.now() + 15_000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(gate(name))) {
    if (Date.now() > deadline) throw new Error(`Timed out at ${name}`);
    Atomics.wait(sleeper, 0, 0, 10);
  }
};
const wait = async (name: string) => {
  const deadline = Date.now() + 15_000;
  while (!fs.existsSync(gate(name))) {
    if (Date.now() > deadline) throw new Error(`Timed out at ${name}`);
    await delay(10);
  }
};

let observed = false;
let probedLive = false;
const kill = process.kill.bind(process);
process.kill = (pid, signal) => {
  if (pid === stalePid && !observed) {
    observed = true;
    log("stale-observed");
    if (role === "first") waitSync("release-stale");
  } else if (pid !== stalePid && !probedLive) {
    probedLive = true;
    log("live-probed", { pid });
  }
  return kill(pid, signal);
};

// The first acquisition retry proves the second process actually contended;
// test gates use timers/promises and cannot produce this event.
let waited = false;
const schedule = globalThis.setTimeout;
globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
  if (!waited && args[1] === 50) {
    waited = true;
    log("waiting");
    if (role === "second") waitSync("allow-second-retry");
  }
  return schedule(...args);
}) as typeof setTimeout;

const enter = () => {
  try {
    fs.mkdirSync(join(root, "critical"));
  } catch (error) {
    log("overlap");
    throw error;
  }
  log("entered");
};
const leave = () => {
  fs.rmdirSync(join(root, "critical"));
  log("left");
};

try {
  if (mode === "tasks") {
    const mutation: TeamTaskMutation = { toolName: "TaskCreate", args: { subject: role, description: role } };
    const commit = () => {
      const expected = resolveTaskDiskCandidate(disk);
      if (!expected.ok) throw new Error(expected.reason);
      return commitTeamTaskMutation({
        disk, expected, mutation, member: { id: role, name: role, epoch: 1 },
        digest: JSON.stringify, approvedDigest: JSON.stringify(mutation),
        vetoes: [async () => {
          enter();
          try { await wait(`release-${role}`); } finally { leave(); }
          return undefined;
        }],
      });
    };
    const result = await commit();
    log("result", { result });
    if (role === "second" && !result.ok && result.conflict) {
      await wait("retry");
      log("retried", { result: await commit() });
    }
  } else {
    const roster = join(root, "team", "main", "roster.json");
    const rename = fs.renameSync;
    fs.renameSync = (source, destination) => {
      if (destination === roster) {
        enter();
        try { waitSync(`release-${role}`); } finally { leave(); }
      }
      rename(source, destination);
    };
    syncBuiltinESMExports();
    await createTeamTransport({
      directory: join(root, "team"), lead: { sessionId: "lead", epoch: "epoch", token: "secret" },
    }).addMember({ teamId: "main", member: { memberId: role, sessionId: role, token: role } });
    log("result", { result: { ok: true } });
  }
} catch (error) {
  log("error", { message: String(error) });
  process.exitCode = 1;
}
