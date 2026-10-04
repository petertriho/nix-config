import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import teamMember from "../team-member.ts";
import { answerApproval, makeApprovalRequest, type ApprovalRequest } from "../teams/approval.ts";
import { createMemberMailbox, createTeamTransport } from "../teams/transport.ts";
import { resolveTaskDiskCandidate } from "../tasks/disk-policy.ts";
import { commitTeamTaskMutation, registerTeamTaskVeto, type TeamTaskMutation } from "../teams/task-writer.ts";

type Handler = (event: any, ctx: any) => unknown;

type MemberFixture = {
  root: string; path: string; handlers: Map<string, Handler[]>; transport: ReturnType<typeof createTeamTransport>;
  mailbox: ReturnType<typeof createMemberMailbox>; context: any; sent: string[];
};

async function fixture(run: (fixture: MemberFixture) => Promise<void>): Promise<void> {
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
  const mailbox = createMemberMailbox({ directory, teamId: "main", member, leadSessionId: lead.sessionId });
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
    await run({ root, path, handlers, transport, mailbox, context, sent });
  } finally {
    for (const handler of handlers.get("session_shutdown") ?? []) await handler({}, context);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

for (const receiptChange of ["changed", "unchanged"]) {
  test(`two reloads in one epoch publish distinct ${receiptChange} receipts and keep polling`, async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    await fixture(async ({ root, handlers, transport, mailbox, context, sent }) => {
      const notices = await transport.receiveNotices("main");
      assert.equal(notices.length, 1);
      assert.equal(notices[0].kind, "startup");
      await transport.ackNotice({ teamId: "main", messageId: notices[0].id });
      const expectedMessages: string[] = [];
      for (const occurrence of [1, 2]) {
        // Reload stops the old poller before the next startup occurrence.
        await handlers.get("session_shutdown")![0]({}, context);
        if (receiptChange === "changed" && occurrence === 2) {
          writeFileSync(join(root, "agent", "tasks-config.json"),
            '{"autoClearCompleted":"never","taskScope":"project"}');
        }
        await handlers.get("session_start")![0]({ reason: "reload" }, context);
        const pending = await transport.receiveNotices("main");
        assert.equal(pending.length, 1, "each reload must publish a new receipt, even if unchanged");
        const notice = pending[0];
        assert.equal(notice.kind, "startup");
        assert.equal(JSON.parse(notice.body).memberEpoch, 1);
        notices.push(notice);

        // Retrying the same occurrence must retain its identity and deduplicate.
        const retried = await mailbox.notice({
          kind: "startup", requestId: notice.requestId, body: notice.body,
        });
        assert.equal(retried.id, notice.id);
        assert.equal(retried.sequence, notice.sequence);
        assert.deepEqual(await transport.receiveNotices("main"), [
          { ...notice, attempts: notice.attempts + 1 },
        ]);
        await transport.ackNotice({ teamId: "main", messageId: notice.id });
        await mailbox.notice({ kind: "startup", requestId: notice.requestId, body: notice.body });
        assert.deepEqual(await transport.receiveNotices("main"), []);

        const body = `Message after reload ${occurrence}`;
        await transport.sendFromLead({
          teamId: "main", to: "alice", requestId: `after-reload-${occurrence}`, body,
        });
        t.mock.timers.tick(1000);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expectedMessages.push(`Message from the team lead:\n\n${body}`);
        assert.deepEqual(sent, expectedMessages);
        assert.deepEqual(await mailbox.receive(), [], "polling must acknowledge delivered messages");
        assert.equal(existsSync(join(root, "team", "main", "pause-alice.json")), false);
      }
      assert.equal(new Set(notices.map((notice) => notice.requestId)).size, 3);
      assert.equal(new Set(notices.map((notice) => notice.id)).size, 3);
      assert.equal(notices[1].body, notices[0].body);
      if (receiptChange === "changed") {
        assert.notEqual(JSON.parse(notices[2].body).configFingerprint,
          JSON.parse(notices[1].body).configFingerprint);
      } else {
        assert.equal(notices[2].body, notices[1].body);
      }
    });
  });
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

async function commitTeammateUpdate({ root, path, transport, context }: MemberFixture): Promise<void> {
  const member = { memberId: "bob", name: "Bob", sessionId: "bob-child", token: randomUUID(), epoch: 1 };
  await transport.addMember({ teamId: "main", member });
  const sessionFile = join(root, "bob-child.jsonl");
  writeFileSync(sessionFile, '{"type":"session","id":"bob-child","version":3}\n');
  const disk = {
    cwd: context.cwd, agentDir: join(root, "agent"), sessionId: member.sessionId, sessionFile, piTasks: path,
  };
  const mutations: TeamTaskMutation[] = [
    { toolName: "TaskCreate", args: { subject: "Bob's task", description: "Another member's work" } },
    { toolName: "TaskUpdate", args: { taskId: "1", owner: "Bob", status: "in_progress" } },
  ];
  for (const mutation of mutations) {
    const expected = resolveTaskDiskCandidate(disk);
    if (!expected.ok) throw new Error(expected.reason);
    const identity = {
      toolCallId: randomUUID(), memberId: member.memberId, memberEpoch: member.epoch,
      memberSessionId: member.sessionId, leadSessionId: "lead",
    };
    const request = makeApprovalRequest({ ...identity, toolName: mutation.toolName, input: mutation.args });
    const approval = answerApproval(request, true);
    const result = await commitTeamTaskMutation({
      disk, expected, mutation,
      member: { id: member.memberId, name: member.name, epoch: member.epoch },
      approvedDigest: approval.digest,
      digest: (call) => makeApprovalRequest({ ...identity, toolName: call.toolName, input: call.args }).digest,
      vetoes: [],
    });
    if (!result.ok) throw new Error(result.reason);
    await transport.recordTaskCommit({
      teamId: "main", memberId: member.memberId, epoch: member.epoch,
      previous: expected.storeFingerprint, next: result.candidate.storeFingerprint,
    });
  }
}

for (const toolName of ["TaskList", "read"]) {
  for (const timing of ["before call", "before result"]) {
    test(`${toolName} reconciles another member's approved update ${timing} without pausing writes`, async () => {
      await fixture(async (state) => {
        const { root, path, handlers, transport, context } = state;
        if (timing === "before call") await commitTeammateUpdate(state);
        const event = {
          toolName, toolCallId: "safe-read", input: toolName === "read" ? { path } : {},
        };
        assert.equal(await handlers.get("tool_call")![0](event, context), undefined);
        if (timing === "before result") await commitTeammateUpdate(state);
        await handlers.get("tool_result")![0]({
          ...event, content: [{ type: "text", text: "Current tasks" }], isError: false,
        }, context);
        assert.equal(existsSync(join(root, "team", "main", "pause-alice.json")), false);

        const stopAnswers = answerRequests(transport, true);
        try {
          const intercepted: any = await handlers.get("tool_call")![0]({
            toolName: "TaskCreate", toolCallId: "after-teammate-update",
            input: { subject: "Alice's task", description: "Writes still work" },
          }, context);
          assert.equal(intercepted.block, true);
          assert.match(intercepted.reason, /^TEAM_INTERCEPTED_/);
          const result: any = await handlers.get("message_end")![0]({
            message: {
              role: "toolResult", toolCallId: "after-teammate-update", toolName: "TaskCreate",
              content: [{ type: "text", text: intercepted.reason }], isError: true, timestamp: Date.now(),
            },
          }, context);
          assert.equal(result.message.isError, false);
          await handlers.get("turn_end")![0]({ toolResults: [result.message] }, context);
          const tasks = JSON.parse(readFileSync(path, "utf8")).tasks;
          assert.equal(tasks[0].owner, "Bob");
          assert.equal(tasks[0].status, "in_progress");
          assert.equal(tasks[1].subject, "Alice's task");
          assert.equal(existsSync(join(root, "team", "main", "pause-alice.json")), false);
          assert.equal((await transport.getTaskState("main")).pauseReason, undefined);
        } finally {
          stopAnswers();
        }
      });
    });
  }
}

for (const drift of ["unrecorded store", "invalid store", "configuration", "lead hold", "unavailable roster"]) {
  test(`read-result reconciliation still pauses writes for ${drift}`, async () => {
    await fixture(async (state) => {
      const { root, path, handlers, transport, context } = state;
      await commitTeammateUpdate(state);
      if (drift === "unrecorded store") {
        writeFileSync(path, readFileSync(path, "utf8") + "\n");
      } else if (drift === "invalid store") {
        writeFileSync(path, '{"tasks":"invalid"}');
      } else if (drift === "configuration") {
        writeFileSync(join(root, "agent", "tasks-config.json"),
          '{"autoClearCompleted":"never","taskScope":"project"}');
      } else if (drift === "lead hold") {
        await transport.pauseTaskWrites("main", "Uncertain commit");
      } else {
        writeFileSync(join(root, "team", "main", "roster.json"), "{");
      }
      const event = { toolName: "TaskList", toolCallId: "read-with-drift", input: {} };
      assert.equal(await handlers.get("tool_call")![0](event, context), undefined);
      await handlers.get("tool_result")![0]({
        ...event, content: [{ type: "text", text: "Read completed" }], isError: false,
      }, context);
      const marker = JSON.parse(readFileSync(join(root, "team", "main", "pause-alice.json"), "utf8"));
      const reason = drift === "lead hold" ? /Team lead paused writes/
        : drift === "unavailable roster" ? /Shared task baseline check failed/
        : drift === "invalid store" ? /Invalid task envelope/
        : /Native or external tool changed/;
      assert.match(marker.reason, reason);
      const blocked: any = await handlers.get("tool_call")![0]({
        toolName: "bash", toolCallId: "after-drift", input: { command: "true" },
      }, context);
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /Teammate writes paused/);
    });
  });
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
    await fixture(async ({ root, path, handlers, transport, context }) => {
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
        const current = resolveTaskDiskCandidate({
          cwd: context.cwd, agentDir: join(root, "agent"), sessionId: "child",
          sessionFile: join(root, "child.jsonl"), piTasks: path,
        });
        assert.ok(current.ok);
        assert.notEqual((await transport.getTaskState("main")).fingerprint, current.storeFingerprint,
          "the lead has not yet recorded this member's commit");
        await handlers.get("tool_result")![0]({
          toolName: "read", toolCallId: "read-after-own-commit", input: { path },
          content: [{ type: "text", text: "Current tasks" }], isError: false,
        }, context);
        assert.equal(existsSync(join(root, "team", "main", "pause-alice.json")), false);
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
