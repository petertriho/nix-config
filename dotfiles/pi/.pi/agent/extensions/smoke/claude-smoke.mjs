import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.TMUX || spawnSync("tmux", ["display-message", "-p", "#{pane_id}"]).status !== 0) {
  throw new Error("test:claude-smoke needs a real attached tmux pane");
}
const check = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 10_000 });
if (check.error || check.status !== 0) {
  throw new Error("A runnable Claude CLI is required for live Claude smoke");
}
const cwd = mkdtempSync(join(tmpdir(), "pi-claude-live-smoke-"));
function turn(prompt, resume) {
  const args = ["-p", "--output-format", "json"];
  if (resume) args.push("--resume", resume);
  args.push(prompt);
  const run = spawnSync("claude", args, {
    cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.error?.message ?? run.stderr);
  const response = JSON.parse(run.stdout);
  assert.equal(response.is_error, false, JSON.stringify(response));
  assert.ok(typeof response.session_id === "string" && response.session_id,
    "Claude must return a session ID for resume");
  return response;
}
try {
  const firstMarker = `PI_CLAUDE_SMOKE_${randomUUID()}`;
  const first = turn(`Reply with only ${firstMarker}. Do not use tools.`);
  assert.match(first.result, new RegExp(firstMarker));
  const secondMarker = `PI_CLAUDE_RESUME_${randomUUID()}`;
  const second = turn(`Reply with only ${secondMarker}. Do not use tools.`, first.session_id);
  assert.equal(second.session_id, first.session_id, "Claude must resume the same session");
  assert.match(second.result, new RegExp(secondMarker));
  console.log("live Claude CLI launch and saved-session resume passed");
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
