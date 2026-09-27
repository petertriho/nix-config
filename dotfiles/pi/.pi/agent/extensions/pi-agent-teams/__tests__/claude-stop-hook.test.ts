import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const plugin = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin");
const config = JSON.parse(readFileSync(join(plugin, "hooks", "hooks.json"), "utf8"));
const prompt = "Finish the review.";
const user = (content: string) => ({ type: "user", message: { role: "user", content } });
const toolResult = {
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: "review", content: "passed" }] },
};
const oldMessages = [user("Earlier question: café"), user("Earlier follow-up")];
const serialize = (messages: object[]) => messages.map((message) => JSON.stringify(message) + "\n").join("");

function withLaunch(run: (launch: {
  transcript: string;
  sentinel: string;
  env: NodeJS.ProcessEnv;
  start: (source?: string) => void;
  append: (...messages: object[]) => void;
  stop: (extra?: Record<string, unknown>) => void;
}) => void) {
  const dir = mkdtempSync(join(tmpdir(), "pi-claude-stop-"));
  try {
    const transcript = join(dir, "transcript.jsonl");
    const sentinel = join(dir, "done");
    const env: NodeJS.ProcessEnv = {
      ...process.env, PI_CLAUDE_SENTINEL: sentinel,
      PI_CLAUDE_PROMPT_HASH: createHash("sha256").update(prompt).digest("hex"),
      CLAUDE_PLUGIN_ROOT: plugin,
    };
    const invoke = (event: string, extra: Record<string, unknown>) => {
      const input = JSON.stringify({ hook_event_name: event, transcript_path: transcript, ...extra });
      for (const group of config.hooks[event]) {
        if (group.matcher && !new RegExp(`^(?:${group.matcher})$`).test(String(extra.source))) continue;
        for (const hook of group.hooks) {
          execFileSync("bash", ["-c", hook.command], { input, env });
        }
      }
    };
    run({
      transcript, sentinel, env,
      start: (source = "resume") => invoke("SessionStart", { source }),
      append: (...messages) => appendFileSync(transcript, serialize(messages)),
      stop: (extra = {}) => invoke("Stop", {
        last_assistant_message: "Review completed.", stop_hook_active: false, ...extra,
      }),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const history of [oldMessages, [user(prompt), ...oldMessages, user(prompt)]]) {
  test(`Claude Stop hook accepts resumed launch with ${history.length === 4 ? "repeated" : "new"} prompt text`, () => {
    withLaunch(({ transcript, sentinel, start, append, stop }) => {
      writeFileSync(transcript, serialize(history));
      start();
      append(user(prompt), toolResult, { type: "assistant", message: { content: "Review completed." } });
      stop();
      assert.equal(readFileSync(sentinel, "utf8").trim(), "Review completed.");
      assert.equal(readFileSync(sentinel + ".transcript", "utf8").trim(), transcript);
    });
  });
}

for (const interjection of ["Please revise the review.", prompt]) {
  test(`Claude Stop hook rejects a post-launch ${interjection === prompt ? "repeated" : "different"} human prompt`, () => {
    withLaunch(({ transcript, sentinel, start, append, stop }) => {
      writeFileSync(transcript, serialize([user(prompt), ...oldMessages]));
      start();
      append(user(prompt), toolResult, user(interjection));
      stop();
      assert.equal(existsSync(sentinel), false);
      assert.equal(readFileSync(sentinel + ".transcript", "utf8").trim(), transcript);
    });
  });
}

test("Claude Stop hook accepts a fresh launch before the transcript exists", () => {
  withLaunch(({ sentinel, start, append, stop }) => {
    start("startup");
    append(user(prompt), toolResult);
    stop();
    assert.equal(readFileSync(sentinel, "utf8").trim(), "Review completed.");
  });
});

test("Claude SessionStart does not reset a launch boundary after an interjection", () => {
  withLaunch(({ sentinel, start, append, stop }) => {
    start("startup");
    const boundary = readFileSync(sentinel + ".launch", "utf8");
    append(user(prompt), user("Please revise the review."));
    for (const source of ["compact", "clear", "resume", "startup"]) {
      start(source);
      assert.equal(readFileSync(sentinel + ".launch", "utf8"), boundary);
    }
    append(user(prompt));
    stop();
    assert.equal(existsSync(sentinel), false);
  });
});

test("Claude resumes the same text again with a new launch boundary", () => {
  withLaunch(({ sentinel, env, start, append, stop }) => {
    start("startup");
    append(user(prompt));
    stop();
    assert.equal(existsSync(sentinel), true);
    env.PI_CLAUDE_SENTINEL = sentinel + "-resumed";
    start();
    append(user(prompt));
    stop();
    assert.equal(readFileSync(env.PI_CLAUDE_SENTINEL, "utf8").trim(), "Review completed.");
  });
});

test("Claude Stop hook needs a matching launch prompt after the boundary", () => {
  for (const newMessages of [[], [user("Different launch")]]) {
    withLaunch(({ transcript, sentinel, start, append, stop }) => {
      writeFileSync(transcript, serialize([user(prompt)]));
      start();
      append(...newMessages);
      stop();
      assert.equal(existsSync(sentinel), false);
    });
  }
});

test("Claude Stop hook fails closed on missing, malformed, or mismatched boundary data", () => {
  for (const change of ["missing", "malformed", "path", "hash", "offset", "prefix"]) {
    withLaunch(({ transcript, sentinel, start, append, stop }) => {
      writeFileSync(transcript, serialize(oldMessages));
      start();
      const marker = sentinel + ".launch";
      if (change === "missing") {
        rmSync(marker);
      } else if (change === "malformed") {
        writeFileSync(marker, "{");
      } else {
        const boundary = JSON.parse(readFileSync(marker, "utf8"));
        if (change === "path") boundary.transcript_path += "-different";
        if (change === "hash") boundary.prompt_hash = "0".repeat(64);
        if (change === "offset") boundary.offset = -1;
        if (change === "prefix") boundary.prefix_hash = "0".repeat(64);
        writeFileSync(marker, JSON.stringify(boundary));
      }
      append(user(prompt));
      stop();
      assert.equal(existsSync(sentinel), false, change);
    });
  }
});

test("Claude Stop hook rejects a truncated or rewritten transcript prefix", () => {
  for (const replacement of ["", serialize([user("Rewritten historical turn")])]) {
    withLaunch(({ transcript, sentinel, start, append, stop }) => {
      writeFileSync(transcript, serialize(oldMessages));
      start();
      writeFileSync(transcript, replacement);
      append(user(prompt));
      stop();
      assert.equal(existsSync(sentinel), false);
    });
  }
});

test("Claude Stop hook rejects malformed post-launch transcript data", () => {
  withLaunch(({ transcript, sentinel, start, append, stop }) => {
    start("startup");
    append(user(prompt));
    appendFileSync(transcript, "{invalid\n");
    stop();
    assert.equal(existsSync(sentinel), false);
  });
});

test("Claude Stop hook retains the loop guard and legacy single-prompt behavior", () => {
  withLaunch(({ sentinel, env, append, stop }) => {
    delete env.PI_CLAUDE_PROMPT_HASH;
    append(user(prompt), toolResult);
    stop({ stop_hook_active: true });
    assert.equal(existsSync(sentinel), false);
    stop();
    assert.equal(readFileSync(sentinel, "utf8").trim(), "Review completed.");
    rmSync(sentinel);
    append(user(prompt));
    stop();
    assert.equal(existsSync(sentinel), false);
  });
});
