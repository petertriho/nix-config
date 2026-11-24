// Real pi and tmux smoke of pi-tmux-agents: the CLI drives pi agents in a
// temporary tmux session, with an offline model. Run it in a tmux pane.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extension = resolve(here, "../pi-tmux-agents/index.ts");
const provider = resolve(here, "pi-tmux-agents-provider.ts");
const cli = resolve(here, "../../../../../scripts/.local/bin/pi-tmux-agents");

if (!process.env.TMUX || spawnSync("tmux", ["info"], { stdio: "ignore" }).status !== 0) {
  throw new Error("test:pi-tmux-agents-smoke needs a tmux pane");
}

const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-tmux-agents-smoke-")));
const agentDir = join(root, "agent");
const work = join(root, "work");
const state = join(root, "state");
const session = `pta-smoke-${process.pid}`;
const lead = `smoke-lead-${process.pid}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// tmux gives a new pane the environment of the process that creates it. npm
// run puts node_modules/.bin first on PATH, and its pi is the old dev
// package, so the agents would not run the installed pi.
const path = (process.env.PATH ?? "").split(":")
  .filter((entry) => !entry.endsWith("/node_modules/.bin")).join(":");
const env = { ...process.env, PATH: path, PI_TMUX_AGENTS_STATE_DIR: state };
for (const name of [
  "PI_TMUX_AGENT_ID", "PI_TMUX_AGENT_DIR", "TMUX_WORKER_ID", "PI_SUBAGENT_ID",
  "PI_SUBAGENT_SESSION", "PI_SESSION_ID",
]) delete env[name];

function run(args, extraEnv = {}) {
  return spawnSync(cli, args, { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 60_000 });
}

function ok(args) {
  const result = run(args);
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
  return result;
}

function pull() {
  return ok(["pull", "--lead", lead, "--json"]).stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function pullNext(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = pull();
    if (records.length > 0) return records;
    await sleep(500);
  }
  throw new Error(`no event after ${timeoutMs} ms`);
}

/** Every record of the next ms milliseconds. */
async function pullFor(ms) {
  const records = [];
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    records.push(...pull());
    await sleep(500);
  }
  return records;
}

function agent(id) {
  return JSON.parse(ok(["list", "--json", "--lead", lead]).stdout).find((entry) => entry.id === id);
}

async function waitStatus(id, status, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (agent(id)?.status === status) return;
    await sleep(250);
  }
  throw new Error(`agent ${id} is ${agent(id)?.status}, not ${status}`);
}

function meta(id) {
  return JSON.parse(readFileSync(join(state, id, "meta.json"), "utf8"));
}

function turns(id) {
  return readFileSync(join(state, id, "turns.jsonl"), "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function expectOne(event, text, timeoutMs) {
  const records = await pullNext(timeoutMs);
  assert.equal(records.length, 1, JSON.stringify(records));
  assert.equal(records[0].event, event, JSON.stringify(records[0]));
  if (text !== undefined) assert.equal(records[0].text, text);
  return records[0];
}

try {
  mkdirSync(join(agentDir, "extensions"), { recursive: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(agentDir, "extensions", "pi-tmux-agents.ts"),
    `export { default } from ${JSON.stringify(extension)};\n`);
  writeFileSync(join(agentDir, "extensions", "smoke-provider.ts"),
    `export { default } from ${JSON.stringify(provider)};\n`);
  const created = spawnSync("tmux", [
    "new-session", "-d", "-s", session, "-c", work,
    "-e", `PI_CODING_AGENT_DIR=${agentDir}`, "-e", "PI_OFFLINE=1", "-e", "PI_SKIP_VERSION_CHECK=1",
  ], { encoding: "utf8", env });
  assert.equal(created.status, 0, created.stderr);

  // 1. Spawn: a window opens and the first prompt runs. The prompt starts
  // with -, so it must reach pi through the inbox.
  const spawned = ok([
    "spawn", "--session", session, "--cwd", work, "--name", "smoke", "--model", "pta-smoke/mock",
    "--lead", lead, "--", "-starts with a dash",
  ]);
  const id = spawned.stdout.trim();
  assert.match(id, /^[0-9a-f]{6}$/);
  const windows = spawnSync("tmux", ["list-windows", "-t", `=${session}`, "-F", "#{window_id}"], { encoding: "utf8" });
  assert.ok(windows.stdout.split("\n").includes(meta(id).window_id), "the agent window must exist");

  // 2. pull returns stop with the reply, once.
  const first = await expectOne("stop", "echo: -starts with a dash", 60_000);
  assert.ok(first.session_file.endsWith(".jsonl"), "the record must name the session file");
  assert.deepEqual(pull(), [], "a stop must come once");
  console.log("1-2 spawn, first prompt, and one stop passed");

  // 3. A send to an idle agent, then to a working agent, gives one stop for
  // the combined run.
  ok(["send", id, "--", "second"]);
  await expectOne("stop", "echo: second");
  ok(["send", id, "--", "SLOW 3"]);
  await waitStatus(id, "working");
  ok(["send", id, "--", "after slow"]);
  const combined = await pullFor(10_000);
  assert.deepEqual(combined.map((record) => [record.event, record.text]), [["stop", "echo: after slow"]]);
  console.log("3 send to an idle and to a working agent passed");

  // 4. interrupt gives interrupted.
  ok(["send", id, "--", "SLOW 60"]);
  await waitStatus(id, "working");
  ok(["interrupt", id]);
  await expectOne("interrupted");
  // A dialog gives waiting. A message waits until the dialog closes, and an
  // interrupt closes the dialog.
  ok(["send", id, "--", "ASK"]);
  const waiting = await expectOne("waiting");
  assert.match(waiting.message, /Smoke question/);
  assert.match(waiting.screen, /Continue the smoke\?/);
  // The held message runs 2 seconds, so that a pull sees the interrupted
  // event first: pull reports only the newest event of an agent.
  ok(["send", id, "--", "SLOW 2 held"]);
  await sleep(2_000);
  assert.equal(readdirSync(join(state, id, "inbox")).filter((name) => !name.startsWith(".")).length, 1,
    "the message must wait while the dialog is open");
  ok(["interrupt", id]);
  await expectOne("interrupted");
  await expectOne("stop", "slow done");
  console.log("4 interrupt, dialog, and held message passed");

  // 5. stop, then send, resumes the same pi session.
  ok(["stop", id]);
  assert.equal(agent(id).status, "stopped");
  assert.deepEqual(pull(), [], "a stopped agent has no events");
  const resumed = ok(["send", id, "--", "resumed"]);
  assert.match(resumed.stderr, /reopened/);
  await expectOne("stop", "echo: resumed", 60_000);
  assert.deepEqual([...new Set(turns(id).map((line) => line.session_id))], [meta(id).pi_session]);
  console.log("5 stop and resume on the same pi session passed");

  // 6. A killed pane gives gone, once.
  spawnSync("tmux", ["kill-pane", "-t", meta(id).pane]);
  await expectOne("gone", undefined, 10_000);
  assert.deepEqual(pull(), [], "gone must come once");
  assert.equal(agent(id).status, "dead");
  console.log("6 gone passed");

  // 7. wait exit codes.
  ok(["send", id, "--", "wait zero"]);
  const zero = run(["wait", id, "--timeout", "60"]);
  assert.equal(zero.status, 0, zero.stderr);
  assert.equal(zero.stdout.trim(), "echo: wait zero");
  assert.match(zero.stderr, /event=stop/);
  assert.equal(run(["wait", id, "--timeout", "1"]).status, 124);
  ok(["send", id, "--", "SLOW 60"]);
  await waitStatus(id, "working");
  ok(["interrupt", id]);
  const one = run(["wait", id, "--timeout", "30"]);
  assert.equal(one.status, 1, one.stderr);
  assert.match(one.stderr, /event=interrupted/);
  ok(["stop", id]);
  assert.equal(run(["wait", id]).status, 2);
  console.log("7 wait exit codes 0, 124, 1, and 2 passed");

  // 8. spawn refuses inside an agent.
  const nested = run(["spawn", "--session", session, "--cwd", work, "--", "nested"], { PI_TMUX_AGENT_ID: id });
  assert.equal(nested.status, 64, nested.stderr);
  console.log("8 spawn refusal inside an agent passed");
  console.log("pi-tmux-agents smoke passed");
} catch (error) {
  // Show what the agents did, for a failure that the assertion does not explain.
  for (const id of readdirSync(state, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    console.error(`--- ${id} turns.jsonl\n${readFileSync(join(state, id, "turns.jsonl"), "utf8")}`);
    console.error(`--- ${id} inbox: ${readdirSync(join(state, id, "inbox")).join(" ")}`);
    console.error(`--- ${id} screen\n${run(["read", id, "--lines", "30"]).stdout}`);
  }
  throw error;
} finally {
  spawnSync("tmux", ["kill-session", "-t", `=${session}`], { stdio: "ignore" });
  rmSync(root, { recursive: true, force: true });
}
