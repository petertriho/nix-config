import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import teamMember from "../team-member.ts";
import { answerApproval, type ApprovalRequest } from "../team-approval.ts";
import { createTeamTransport } from "../team-transport.ts";
import { resolveTaskDiskCandidate } from "../task-disk-policy.ts";
import { registerTeamTaskVeto } from "../team-task-writer.ts";

type Handler = (event: any, ctx: any) => unknown;

async function fixture(run: (fixture: {
  root: string; path: string; handlers: Map<string, Handler[]>; transport: ReturnType<typeof createTeamTransport>;
  context: any; sent: string[];
}) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pi-member-intercept-"));
  const agentDir = join(root, "agent");
  const cwd = join(root, "workspace");
  mkdirSync(agentDir);
  mkdirSync(cwd);
  writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
  const path = join(root, "tasks.json");
  const sessionFile = join(root, "child.jsonl");
  writeFileSync(sessionFile, '{"type":"session","id":"child","version":3}\n');
  const directory = join(root, "team");
  const lead = { sessionId: "lead", epoch: randomUUID(), token: randomUUID() };
  const transport = createTeamTransport({ directory, lead });
  const initial = resolveTaskDiskCandidate({
    cwd, agentDir, sessionId: "child", sessionFile, piTasks: path,
  });
  if (!initial.ok) throw new Error(initial.reason);
  await transport.createTeam("main", "main", initial.storeFingerprint);
  const member = { memberId: "alice", name: "Alice", sessionId: "child", token: randomUUID(), epoch: 1 };
  await transport.addMember({ teamId: "main", member });
  const vars = {
    PI_TEAM_DIRECTORY: directory, PI_TEAM_ID: "main", PI_TEAM_MEMBER_ID: member.memberId,
    PI_TEAM_MEMBER_TOKEN: member.token, PI_TEAM_MEMBER_EPOCH: "1",
    PI_TEAM_CHILD_SESSION_ID: "child", PI_TEAM_LEAD_SESSION_ID: "lead",
    PI_TASKS: path, PI_CODING_AGENT_DIR: agentDir, PI_SUBAGENT_NAME: "Alice",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const handlers = new Map<string, Handler[]>();
  const sent: string[] = [];
  const pi = {
    on(name: string, handler: Handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    sendUserMessage(content: string) { sent.push(content); },
  };
  const abort = new AbortController();
  const context = {
    cwd, mode: "tui", hasUI: true, signal: abort.signal,
    sessionManager: { getSessionId: () => "child", getSessionFile: () => sessionFile },
    ui: { notify() {} },
  };
  try {
    teamMember(pi as any);
    for (const handler of handlers.get("session_start") ?? []) {
      await handler({ reason: "startup" }, context);
    }
    await run({ root, path, handlers, transport, context, sent });
  } finally {
    for (const handler of handlers.get("session_shutdown") ?? []) await handler({}, context);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function answerRequests(
  transport: ReturnType<typeof createTeamTransport>, approve: boolean,
  beforeAnswer?: () => Promise<void>,
) {
  let active = false;
  let failure: unknown;
  const timer = setInterval(() => {
    if (active) return;
    active = true;
    void transport.receiveNotices("main").then(async (messages) => {
      for (const message of messages) {
        if (message.kind === "approval_request") {
          const request = JSON.parse(message.body) as ApprovalRequest;
          await beforeAnswer?.();
          await transport.sendFromLead({
            teamId: "main", to: "alice", kind: "approval_response",
            requestId: request.requestId, body: JSON.stringify(answerApproval(request, approve)),
          });
        }
        await transport.ackNotice({ teamId: "main", messageId: message.id });
      }
    }).catch((error) => { failure = error; }).finally(() => { active = false; });
  }, 10);
  return () => {
    clearInterval(timer);
    if (failure) throw failure;
  };
}

test("a native lead change invalidates an in-flight approval without permanently pausing the teammate", async () => {
  await fixture(async ({ root, path, handlers, transport, context }) => {
    let changed = false;
    const stopFirst = answerRequests(transport, true, async () => {
      if (changed) return;
      changed = true;
      const previous = (await transport.getTaskState("main")).fingerprint;
      assert.ok(previous);
      writeFileSync(path, '{"nextId":1,"tasks":[]}');
      const updated = resolveTaskDiskCandidate({
        cwd: context.cwd, agentDir: join(root, "agent"), sessionId: "child",
        sessionFile: join(root, "child.jsonl"), piTasks: path,
      });
      assert.equal(updated.ok, true);
      if (!updated.ok) return;
      await transport.recordObservedTaskChange({
        teamId: "main", previous, next: updated.storeFingerprint,
      });
    });
    try {
      const refused: any = await handlers.get("tool_call")![0]({
        toolName: "TaskCreate", toolCallId: "stale-approval",
        input: { subject: "First", description: "Before the native change" },
      }, context);
      assert.match(refused.reason, /baseline changed after approval/);
      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).tasks, []);
      assert.equal((await transport.getTaskState("main")).pauseReason, undefined);
    } finally {
      stopFirst();
    }
    const stopSecond = answerRequests(transport, true);
    try {
      const retried: any = await handlers.get("tool_call")![0]({
        toolName: "TaskCreate", toolCallId: "fresh-approval",
        input: { subject: "Second", description: "After the native change" },
      }, context);
      assert.equal(retried.block, true);
      const result = await handlers.get("message_end")![0]({
        message: {
          role: "toolResult", toolCallId: "fresh-approval", toolName: "TaskCreate",
          content: [{ type: "text", text: retried.reason }], isError: true, timestamp: Date.now(),
        },
      }, context) as any;
      assert.equal(result.message.isError, false);
      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).tasks.map((task: { subject: string }) => task.subject),
        ["Second"]);
      assert.equal((await transport.getTaskState("main")).pauseReason, undefined);
    } finally {
      stopSecond();
    }
  });
});

test("an unsafe task file and an undelivered committed result still pause teammate writes", async () => {
  await fixture(async ({ root, path, handlers, transport, context, sent }) => {
    writeFileSync(path, '{"tasks":"invalid"}');
    const unsafe: any = await handlers.get("tool_call")![0]({
      toolName: "TaskCreate", toolCallId: "unsafe",
      input: { subject: "Blocked", description: "Unsafe file" },
    }, context);
    assert.match(unsafe.reason, /task envelope/i);
    assert.equal(existsSync(join(root, "team", "main", "pause-alice.json")), true);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).tasks, "invalid");
    assert.equal((await transport.getTaskState("main")).pauseReason, undefined);
    assert.equal(sent.length, 0);
  });
  await fixture(async ({ root, path, handlers, transport, context, sent }) => {
    const stopAnswers = answerRequests(transport, true);
    try {
      const committed: any = await handlers.get("tool_call")![0]({
        toolName: "TaskCreate", toolCallId: "undelivered",
        input: { subject: "Committed", description: "Result not delivered" },
      }, context);
      assert.equal(committed.block, true);
      assert.equal(JSON.parse(readFileSync(path, "utf8")).tasks.length, 1);
      await handlers.get("turn_end")![0]({ toolResults: [] }, context);
      assert.equal(existsSync(join(root, "team", "main", "pause-alice.json")), true);
      assert.match(sent[0], /committed task result was not delivered/i);
      const next: any = await handlers.get("tool_call")![0]({
        toolName: "TaskCreate", toolCallId: "after-uncertain",
        input: { subject: "Refused", description: "Still paused" },
      }, context);
      assert.match(next.reason, /writes paused/i);
    } finally {
      stopAnswers();
    }
  });
});

for (const order of ["native-first", "member-first"]) {
  test(`teammate TaskCreate blocks native double-write and replaces only its result (${order})`, async () => {
    await fixture(async ({ path, handlers, transport, context }) => {
      const calls: string[] = [];
      const nativeHook: Handler = () => { calls.push("native hook"); };
      const teamHooks = handlers.get("tool_call") ?? [];
      handlers.set("tool_call", order === "native-first"
        ? [nativeHook, ...teamHooks] : [...teamHooks, nativeHook]);
      const stopAnswers = answerRequests(transport, true);
      try {
        const args = { subject: "New", description: "Work" };
        const event = { toolName: "TaskCreate", toolCallId: "call-1", input: args };
        let blocked: { block?: boolean; reason?: string } | undefined;
        for (const hook of handlers.get("tool_call") ?? []) {
          const result = await hook(event, context) as typeof blocked;
          if (result?.block) { blocked = result; break; }
        }
        assert.equal(blocked?.block, true);
        assert.equal(calls.length, order === "native-first" ? 1 : 0);
        assert.ok(existsSync(path), "the adapter wrote the actual task list");
        const persisted = JSON.parse(readFileSync(path, "utf8"));
        assert.deepEqual(persisted.tasks.map((task: { id: string }) => task.id), ["1"]);
        const resultEvent = {
          message: {
            role: "toolResult", toolCallId: "call-1", toolName: "TaskCreate",
            content: [{ type: "text", text: blocked!.reason }], details: {}, isError: true, timestamp: Date.now(),
          },
        };
        const replacement = await handlers.get("message_end")![0](resultEvent, context) as any;
        assert.equal(replacement.message.isError, false);
        assert.match(replacement.message.content[0].text, /#1 New/);
        assert.equal((await handlers.get("message_end")![0]({
          message: { ...resultEvent.message, toolCallId: "unrelated" },
        }, context)), undefined);
      } finally {
        stopAnswers();
      }
    });
  });
}

test("a denied user decision and a pre-commit hook veto prevent any task write", async () => {
  await fixture(async ({ path, handlers, transport, context }) => {
    const stopAnswers = answerRequests(transport, false);
    try {
      const result: any = await handlers.get("tool_call")![0]({
        toolName: "TaskCreate", toolCallId: "denied", input: { subject: "No", description: "Denied" },
      }, context);
      assert.equal(result.block, true);
      assert.equal(existsSync(path), false);
    } finally { stopAnswers(); }
    const unregister = registerTeamTaskVeto(() => "Policy rejected this write");
    const allowAnswers = answerRequests(transport, true);
    try {
      const result: any = await handlers.get("tool_call")![0]({
        toolName: "TaskCreate", toolCallId: "vetoed", input: { subject: "No", description: "Vetoed" },
      }, context);
      assert.equal(result.block, true);
      assert.equal(existsSync(path), false);
    } finally {
      allowAnswers();
      unregister();
    }
  });
});
