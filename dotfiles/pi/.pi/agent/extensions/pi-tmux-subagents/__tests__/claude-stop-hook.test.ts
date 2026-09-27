import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin", "hooks", "on-stop.sh");

test("Claude Stop hook accepts a resumed initial prompt, not a later human interjection", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-claude-stop-"));
  try {
    const transcript = join(dir, "transcript.jsonl");
    const sentinel = join(dir, "done");
    const prompt = "Finish the review.";
    const user = (content: string) => ({ type: "user", message: { role: "user", content } });
    const oldMessages = [user("Earlier question"), user("Earlier follow-up")];
    const hookInput = JSON.stringify({
      transcript_path: transcript, last_assistant_message: "Review completed.", stop_hook_active: false,
    });
    const env = {
      ...process.env, PI_CLAUDE_SENTINEL: sentinel,
      PI_CLAUDE_PROMPT_HASH: createHash("sha256").update(prompt).digest("hex"),
    };
    const invoke = (messages: object[]) => {
      writeFileSync(transcript, messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
      execFileSync("bash", [hook], { input: hookInput, env });
    };
    invoke([...oldMessages, user(prompt)]);
    assert.equal(readFileSync(sentinel, "utf8").trim(), "Review completed.");
    rmSync(sentinel);
    invoke([...oldMessages, user(prompt), user("Please revise the review.")]);
    assert.equal(existsSync(sentinel), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
