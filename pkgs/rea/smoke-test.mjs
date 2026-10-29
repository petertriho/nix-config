#!/usr/bin/env node

// Offline checks for the installed, core-only package. No setup, updater,
// browser, provider installation, or external analysis engine is invoked.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const args = process.argv.slice(2);
const withPty = args.at(-1) === "--pty";
if (withPty) args.pop();
const [packageDirectory, executable] = args;
assert(
  args.length === 2 && packageDirectory && executable && isAbsolute(executable),
  "Usage: node smoke-test.mjs <installed-package-root> <absolute-rea-executable> [--pty]",
);
assert(["linux", "darwin"].includes(process.platform), "Smoke tests require a supported POSIX host");
const root = await realpath(packageDirectory);
const temporary = await mkdtemp(join(tmpdir(), "rea-nix-smoke-"));
const token = randomUUID();
const marker = `REA_NIX_SMOKE_TOKEN=${token}`;
const active = new Set();
const groups = new Set();
let interrupted;
const environment = {
  // The CLI wrapper must supply ps without the user's or builder's tools.
  PATH: dirname(process.execPath),
  HOME: join(temporary, "home"),
  XDG_CONFIG_HOME: join(temporary, "config"),
  XDG_CACHE_HOME: join(temporary, "cache"),
  XDG_DATA_HOME: join(temporary, "data"),
  XDG_STATE_HOME: join(temporary, "state"),
  XDG_RUNTIME_DIR: join(temporary, "run"),
  TMPDIR: join(temporary, "tmp"),
  TMP: join(temporary, "tmp"),
  TEMP: join(temporary, "tmp"),
  LANG: "C",
  LC_ALL: "C",
  TERM: "dumb",
  NO_COLOR: "1",
  CI: "1",
  DO_NOT_TRACK: "1",
  REA_LOG_LEVEL: "silent",
  REA_NIX_SMOKE_TOKEN: token,
  npm_config_offline: "true",
  npm_config_update_notifier: "false",
  npm_config_cache: join(temporary, "cache", "npm"),
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
  PLAYWRIGHT_BROWSERS_PATH: join(temporary, "cache", "browsers"),
};
const signalHandlers = new Map();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  const handler = () => {
    interrupted ??= new Error(`Smoke test interrupted by ${signal}`);
    for (const child of active) child.fail(interrupted);
  };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}
const overall = setTimeout(() => {
  interrupted ??= new Error("Smoke test exceeded its 120-second deadline");
  for (const child of active) child.fail(interrupted);
}, 120_000);

try {
  for (const path of [
    environment.HOME, environment.XDG_CONFIG_HOME, environment.XDG_CACHE_HOME,
    environment.XDG_DATA_HOME, environment.XDG_STATE_HOME, environment.XDG_RUNTIME_DIR,
    environment.TMPDIR,
  ]) await mkdir(path, { recursive: true, mode: 0o700 });
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "rea-agents");
  assert.equal(manifest.bin?.rea, "scripts/rea.mjs");
  assert.equal(manifest.bin?.["rea-agents"], "scripts/rea.mjs");
  assert.equal(typeof manifest.version, "string");
  const toolCount = await checkAssets(manifest);
  await checkNoFrida(manifest);
  report("ok: runtime assets, bridges, generated skill references; no installed Frida");

  let versionOutput;
  for (const command of new Set([executable, join(dirname(executable), "rea"), join(dirname(executable), "rea-agents")])) {
    await access(command, constants.X_OK);
    const help = await run(command, ["--help"]);
    assert.match(help, /analyze-javascript-application/u);
    assert.match(help, /\bmcp\b/u);
    const output = await run(command, ["--version"]);
    const version = output.trim();
    const escaped = manifest.version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert.match(version, new RegExp(`(^|\\s)${escaped}($|\\s)`, "u"));
    if (versionOutput !== undefined) assert.equal(version, versionOutput, "CLI alias version differs");
    versionOutput = version;
  }
  report(`ok: CLI aliases, help and version (${manifest.version})`);
  await checkStaticAnalysis();
  report("ok: static JavaScript Evidence and semantic graph (target not executed)");
  await checkMcp(toolCount, manifest.version);
  report(`ok: MCP initialization, tools/list (${toolCount} tools), clean stdout and EOF shutdown`);
  if (withPty) {
    await checkPty();
    report("ok: native @lydell/node-pty spawned and reaped a bounded Node command");
  } else {
    report("not tested: native PTY execution (rerun with --pty on a host with usable PTYs)");
  }
  assert.deepEqual(await ownedProcesses(), [], "Smoke test left token-owned subprocesses behind");
  if (interrupted) throw interrupted;
} catch (cause) {
  process.exitCode = 1;
  console.error(`REA smoke test failed: ${cause.stack ?? cause}`);
} finally {
  clearTimeout(overall);
  try {
    await cleanup();
  } catch (cause) {
    process.exitCode = 1;
    console.error(`REA smoke cleanup failed: ${cause.stack ?? cause}`);
  } finally {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    await rm(temporary, { recursive: true, force: true });
  }
}

async function checkAssets(manifest) {
  for (const path of [
    "scripts/rea.mjs", "dist/cli.js", "dist/main.js",
    "dist/cli-runtime/cli.js", "dist/cli-runtime/cliOutput.js",
    "dist/cli-runtime/cliResultOutput.js", "dist/cli-runtime/mcpDoctor.js",
    "dist/mcp/main.js", "dist/catalogIdentity.js", "dist/identity.js",
    "dist/generatedPackageMetadata.js",
    "dist/composition/javascriptAnalysisWorkerProcess.js",
    "dist/sqlite/SqliteDatabaseWorker.js", "dist/evm/EvmoleInterfaceWorker.js",
    "scripts/rea-android-workspace-guardian.mjs",
    "scripts/electron-active-hook.cjs", "scripts/electron-active-hook-boundaries.cjs",
    "LICENSE", "THIRD_PARTY_NOTICES.md",
    ...manifest.files.filter((path) => path.startsWith("bridge/")),
  ]) {
    assert(!isAbsolute(path) && !path.split("/").includes(".."), `Unexpected asset path: ${path}`);
    const info = await stat(join(root, path));
    assert(info.isFile() && info.size > 0, `Missing or empty runtime asset: ${path}`);
  }
  const skills = [
    "rea-analysis-optimization", "rea-changelog-update", "rea-ci-tests-audit",
    "rea-tool-design", "reverse-engineer-anything",
  ];
  const bundledSkills = await readdir(join(root, "skills"));
  assert.deepEqual(bundledSkills.sort(), skills, "Incomplete upstream skill inventory");
  for (const name of skills) {
    const bundled = join(root, "skills", name);
    const exposed = join(dirname(dirname(executable)), "share/rea/skills", name);
    assert.equal(await realpath(exposed), await realpath(bundled), `Exposed skill differs: ${name}`);
    const text = await readFile(join(bundled, "SKILL.md"), "utf8");
    assert(text.includes(`\nname: ${name}\n`), `Incorrect skill metadata: ${name}`);
    assert(!/\bnpx(?: -y)? rea-agents(?:@|\b)/u.test(text), `Skill still uses the REA package runner: ${name}`);
  }
  const skillRoot = join(root, "skills", "reverse-engineer-anything");
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const recovery = await readFile(join(skillRoot, "references", "connection-and-recovery.md"), "utf8");
  assert(recovery.includes("`rea doctor --client codex --json`"), "Recovery guide does not use the plain rea command");
  assert.match(skill, /^name: reverse-engineer-anything$/mu);
  assert.match(skill, /^  version: "[^"]+"$/mu);
  const count = /^  tool_count: ([1-9][0-9]*)$/mu.exec(skill);
  assert(count, "Shipped skill lacks generated tool_count metadata");
  const references = [
    "connection-and-recovery", "android-applications", "native-and-artifacts",
    "evidence-workflows", "runtime-observation", "javascript-applications",
  ];
  const paths = ["SKILL.md", ...references.map((name) => `references/${name}.md`)];
  for (const path of paths) {
    const text = await readFile(join(skillRoot, path), "utf8");
    assert(text.length > 0, `Empty skill reference: ${path}`);
    for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/gu)) {
      if (/^(?:[a-z]+:|#)/iu.test(target)) continue;
      const linked = resolve(skillRoot, dirname(path), target.split("#")[0]);
      assert(linked.startsWith(skillRoot + sep), `Skill link escapes the bundle: ${target}`);
      const info = await stat(linked);
      assert(info.isFile(), `Broken skill link: ${target}`);
    }
  }
  return Number(count[1]);
}

async function checkNoFrida(manifest) {
  for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
    assert.equal(manifest[field]?.frida, undefined, `Frida remains in ${field}`);
  }
  const pending = [join(root, "node_modules")];
  const visited = new Set();
  let packages = 0;
  while (pending.length > 0) {
    const directory = pending.pop();
    let canonical;
    try {
      canonical = await realpath(directory);
    } catch (cause) {
      if (cause.code === "ENOENT") continue;
      throw cause;
    }
    if (visited.has(canonical)) continue;
    visited.add(canonical);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.name.startsWith("@")) {
        pending.push(path);
        continue;
      }
      assert.notEqual(entry.name, "frida", `Installed Frida package: ${path}`);
      assert(++packages < 10_000, "Dependency inventory exceeded its package bound");
      const metadata = parseJson(await readFile(join(path, "package.json"), "utf8"), path);
      assert.notEqual(metadata.name, "frida", `Installed Frida under an alias: ${path}`);
      pending.push(join(path, "node_modules"));
    }
  }
  assert(packages > 0, "Installed runtime dependencies are missing");
}

async function checkStaticAnalysis() {
  const fixture = join(temporary, "application");
  const executed = join(temporary, "target-was-executed");
  await mkdir(fixture);
  await writeFile(join(fixture, "package.json"), JSON.stringify({
    name: "rea-nix-smoke-fixture", version: "1.0.0", type: "module", main: "app.js",
  }));
  await writeFile(join(fixture, "app.js"), [
    'import { writeFileSync } from "node:fs";',
    `writeFileSync(${JSON.stringify(executed)}, "must never run");`,
    "export function increment(value) { return value + 1; }",
    "export const answer = increment(41);",
    "",
  ].join("\n"));
  // Upstream CLI returns Evidence directly, not an {ok, result} wrapper:
  // tests/acceptance/applications/javascriptFunctionNameCli.test.ts.
  const evidence = parseJson(await run(executable, [
    "analyze-javascript-application", fixture, "--json",
  ], { timeout: 30_000 }), "static JavaScript CLI output");
  assert.equal(evidence.operation, "analyze_javascript_application");
  assert.match(evidence.evidence_id, /^ev_[0-9a-f]{64}$/u);
  assert(Array.isArray(evidence.limitations), "Missing Evidence limitations");
  const result = evidence.normalized_result;
  assert.equal(result.input_path, fixture);
  assert.equal(result.format, "directory");
  assert.equal(result.statistics.parsed_javascript_files, 1);
  assert.equal(result.statistics.parse_failures, 0);
  assert(result.graph.nodes.length > 0, "Empty application graph");
  assert(result.semantic_graph.nodes.length > 0, "Empty semantic graph");
  assert(result.semantic_graph.relations.some(({ relation }) => relation === "calls"), "Fixture call was not analyzed");
  assert.equal(result.semantic_graph.application_graph_id, result.graph.graph_id);
  assert.equal(result.semantic_graph.root_artifact_sha256, result.root_artifact_sha256);
  await assert.rejects(access(executed), { code: "ENOENT" }, "Static analysis executed the target");
}

async function checkMcp(toolCount, version) {
  const pending = new Map();
  let buffer = "";
  let nextId = 0;
  const child = launch(executable, ["mcp"], {
    timeout: 30_000,
    onStdout(chunk) {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          throw new Error(`Non-protocol MCP stdout: ${line.slice(0, 300)}`);
        }
        assert.equal(message?.jsonrpc, "2.0", "Non-JSON-RPC MCP stdout");
        if (Object.hasOwn(message, "id")) {
          assert(!Object.hasOwn(message, "method"), "Unexpected server request");
          assert(pending.has(message.id), "Unexpected/duplicate MCP response");
          assert(Object.hasOwn(message, "result") !== Object.hasOwn(message, "error"), "Invalid MCP response");
          pending.get(message.id)(message);
          pending.delete(message.id);
        } else {
          assert.match(message.method ?? "", /^notifications\//u, "Invalid MCP notification");
        }
      }
    },
  });
  function send(message) {
    child.process.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  }
  async function request(method, params) {
    const id = ++nextId;
    const reply = new Promise((accept) => pending.set(id, accept));
    send({ id, method, params });
    const message = await Promise.race([
      reply,
      child.closed.then((exit) => { throw failure(child, exit, `MCP exited during ${method}`); }),
    ]);
    assert.equal(message.error, undefined, `MCP ${method} failed: ${JSON.stringify(message.error)}`);
    return message.result;
  }
  const initialized = await request("initialize", {
    // This protocol is exercised by the pinned upstream SDK 2.3.1 tests.
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "rea-nix-smoke-test", version: "1" },
  });
  assert.equal(initialized.protocolVersion, "2025-11-25");
  assert.equal(initialized.serverInfo.version, version);
  assert(initialized.capabilities.tools, "MCP server did not advertise tools");
  send({ method: "notifications/initialized" });
  const names = new Set();
  const cursors = new Set();
  let cursor;
  do {
    const result = await request("tools/list", cursor === undefined ? {} : { cursor });
    assert(Array.isArray(result.tools), "MCP tools/list lacks tools");
    for (const tool of result.tools) {
      assert.equal(typeof tool.name, "string");
      assert(!names.has(tool.name), `Duplicate MCP tool: ${tool.name}`);
      assert.equal(tool.inputSchema?.type, "object", `Missing tool schema: ${tool.name}`);
      names.add(tool.name);
    }
    cursor = result.nextCursor;
    if (cursor !== undefined) {
      assert.equal(typeof cursor, "string");
      assert(!cursors.has(cursor) && cursors.size < 32, "Unbounded tools/list pagination");
      cursors.add(cursor);
    }
  } while (cursor !== undefined);
  assert.equal(names.size, toolCount, "MCP catalog differs from generated skill");
  for (const name of ["binary_session", "open_binary", "close_binary", "analyze_javascript_application"]) {
    assert(names.has(name), `Core MCP tool missing: ${name}`);
  }
  // MCP has no shutdown request. Upstream registers stdin EOF/close to release
  // session/provider resources (src/main/processShutdown.ts).
  child.process.stdin.end();
  await child.expectSuccess();
  assert.equal(buffer, "", "Unterminated/non-protocol MCP stdout");
  assert.equal(pending.size, 0);
}

async function checkPty() {
  // Load only this output's dependency, in a bounded isolated child. Import
  // success is insufficient: a missing helper or unusable PTY must fail.
  const source = `
    import assert from "node:assert/strict";
    import { createRequire } from "node:module";
    const require = createRequire(${JSON.stringify(join(root, "package.json"))});
    const { spawn } = require(${JSON.stringify(join(root, "node_modules/@lydell/node-pty"))});
    const terminal = spawn(process.execPath, ["-e", "process.stdout.write('REA_NIX_PTY_OK\\\\n')"], {
      cwd: ${JSON.stringify(temporary)}, env: process.env,
      name: "xterm-256color", cols: 80, rows: 24,
    });
    let output = "";
    const deadline = setTimeout(() => {
      process.exitCode = 1;
      terminal.kill("SIGKILL");
      console.error("PTY command exceeded its five-second deadline");
    }, 5000);
    terminal.onData((chunk) => {
      output += chunk;
      if (output.length > 4096) {
        process.exitCode = 1;
        terminal.kill("SIGKILL");
      }
    });
    terminal.onExit(({ exitCode, signal }) => {
      clearTimeout(deadline);
      assert.equal(exitCode, 0);
      assert(!signal, "PTY command was killed");
      assert.match(output, /REA_NIX_PTY_OK/);
      console.log("PTY command completed");
    });
  `;
  await run(process.execPath, ["--input-type=module", "-e", source], { timeout: 10_000 });
}

function launch(command, arguments_, { timeout = 15_000, onStdout } = {}) {
  if (interrupted) throw interrupted;
  const process_ = spawn(command, arguments_, {
    cwd: temporary, env: environment, detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const child = { process: process_, stdout: "", stderr: "", error: undefined };
  active.add(child);
  if (process_.pid) groups.add(process_.pid);
  let bytes = 0;
  let escalation;
  let closeStreams;
  child.fail = (cause) => {
    child.error ??= cause;
    signalGroup(process_.pid, "SIGTERM");
    escalation ??= setTimeout(() => signalGroup(process_.pid, "SIGKILL"), 250);
    // A detached descendant can retain a pipe after the launcher dies. Closing
    // our ends on failure lets the finally block scan and kill that descendant.
    closeStreams ??= setTimeout(() => {
      process_.stdin.destroy();
      process_.stdout.destroy();
      process_.stderr.destroy();
    }, 1000);
  };
  const deadline = setTimeout(() => child.fail(new Error(`Command timed out after ${timeout}ms: ${command} ${arguments_.join(" ")}`)), timeout);
  child.closed = new Promise((accept) => {
    process_.on("error", (cause) => { child.error ??= cause; });
    process_.stdin.on("error", (cause) => child.fail(cause));
    for (const [stream, field] of [[process_.stdout, "stdout"], [process_.stderr, "stderr"]]) {
      stream.setEncoding("utf8");
      stream.on("error", (cause) => child.fail(cause));
      stream.on("data", (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 32 * 1024 * 1024) {
          child.fail(new Error("Command exceeded its 32 MiB output bound"));
          return;
        }
        try {
          if (field === "stdout" && onStdout) onStdout(chunk);
          else if (field === "stderr") child.stderr = (child.stderr + chunk).slice(-16_384);
          else child.stdout += chunk;
        } catch (cause) {
          child.fail(cause);
        }
      });
    }
    process_.on("close", (code, signal) => {
      clearTimeout(deadline);
      clearTimeout(escalation);
      clearTimeout(closeStreams);
      active.delete(child);
      accept({ code, signal });
    });
  });
  child.expectSuccess = async () => {
    const exit = await child.closed;
    if (child.error || exit.code !== 0 || exit.signal) throw failure(child, exit, command);
    if (groupExists(process_.pid)) throw new Error(`Command left process-group members behind: ${process_.pid}`);
    groups.delete(process_.pid);
    if (interrupted) throw interrupted;
    return child.stdout;
  };
  return child;
}

async function run(command, arguments_, options) {
  const child = launch(command, arguments_, options);
  child.process.stdin.end();
  return child.expectSuccess();
}

function failure(child, exit, label) {
  return new Error(`${label} (exit=${exit.code}, signal=${exit.signal}): ${child.error?.message ?? ""}\n${child.stderr}`);
}

function report(message) {
  process.stdout.write(`${message}\n`);
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (cause) {
    throw new Error(`Invalid JSON in ${label}`, { cause });
  }
}

function signalGroup(pid, signal) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch (cause) {
    if (cause.code !== "ESRCH") throw cause;
  }
}

function groupExists(pid) {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (cause) {
    if (cause.code === "ESRCH") return false;
    throw cause;
  }
}

async function ownedProcesses() {
  if (process.platform === "linux") {
    const pids = [];
    for (const name of await readdir("/proc")) {
      if (!/^[0-9]+$/u.test(name)) continue;
      try {
        const env = await readFile(`/proc/${name}/environ`);
        if (env.includes(Buffer.from(`${marker}\0`))) pids.push(Number(name));
      } catch (cause) {
        if (!["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(cause.code)) throw cause;
      }
    }
    return pids.sort((a, b) => a - b);
  }
  // Detached upstream analysis workers can leave the launcher's process group.
  // Darwin has no /proc, so inspect inherited ownership tokens with system ps.
  const { stdout } = await promisify(execFile)("/bin/ps", ["eww", "-axo", "pid=,command="], {
    env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
    timeout: 2000, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.split("\n").filter((line) => line.includes(marker))
    .map((line) => Number(/^\s*([0-9]+)/u.exec(line)?.[1])).sort((a, b) => a - b);
}

async function cleanup() {
  for (const child of active) child.fail(new Error("Smoke test cleanup"));
  for (const pid of groups) signalGroup(pid, "SIGTERM");
  // Re-scan before signalling: the inherited random token, not a stale PID,
  // owns detached workers and the native PTY's separate process group.
  let inventoryFailure;
  try {
    for (const signal of ["SIGTERM", "SIGKILL", "SIGKILL"]) {
      for (const pid of await ownedProcesses()) {
        try {
          process.kill(pid, signal);
        } catch (cause) {
          if (cause.code !== "ESRCH") throw cause;
        }
      }
      await delay(200);
    }
  } catch (cause) {
    inventoryFailure = cause;
  } finally {
    for (const pid of groups) signalGroup(pid, "SIGKILL");
  }
  let deadline;
  try {
    await Promise.race([
      Promise.all([...active].map((child) => child.closed)),
      new Promise((_, reject) => {
        deadline = setTimeout(() => {
          for (const child of active) {
            child.process.stdin.destroy();
            child.process.stdout.destroy();
            child.process.stderr.destroy();
          }
          reject(new Error("Subprocesses did not close after SIGKILL"));
        }, 2000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
  if (inventoryFailure) throw inventoryFailure;
  assert.deepEqual(await ownedProcesses(), [], "Could not reap all token-owned subprocesses");
}
