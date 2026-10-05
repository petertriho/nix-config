import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI, ExtensionContext, ToolCallEvent, ToolCallEventResult,
  ToolResultEvent, ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { registerTeamEvents } from "../registration/team-events.ts";
import { createTeamRuntime } from "../runtime/teams.ts";
import type { SubagentRuntime } from "../runtime/refresh.ts";
import type { SessionState } from "../runtime/session-state.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import { checkLeadAdmission } from "../teams/admission.ts";
import { makeApprovalRequest, type ApprovalResponse } from "../teams/approval.ts";
import { createMemberMailbox, LEGACY_NATIVE_TASK_HOLD } from "../teams/transport.ts";
import type { DiskTask } from "../tasks/disk-policy.ts";

type Handler = (
  event: ToolCallEvent | ToolResultEvent, ctx: ExtensionContext,
) => unknown | Promise<unknown>;

function task(id: string, status: DiskTask["status"] = "pending"): DiskTask {
  return {
    id, status, subject: `Task ${id}`, description: `Work for task ${id}`,
    metadata: {}, blocks: [], blockedBy: [], createdAt: 1, updatedAt: 1,
  };
}

function completedHistory(): DiskTask[] {
  return [
    { ...task("1", "completed"), blocks: ["2"] },
    { ...task("2", "completed"), blockedBy: ["1"] },
  ];
}

async function fixture(t: TestContext, initialTasks = [task("1")]) {
  const root = mkdtempSync(join(tmpdir(), "pi-lead-hooks-"));
  const cwd = join(root, "workspace");
  const agentDir = join(root, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
  const path = join(root, "tasks.json");
  const sessionFile = join(root, "lead.jsonl");
  writeFileSync(sessionFile, '{"type":"session","id":"lead","version":3}\n');
  const writeTasks = (tasks: DiskTask[]) => {
    writeFileSync(path, JSON.stringify({
      nextId: Math.max(0, ...tasks.map(({ id }) => Number(id))) + 1, tasks,
    }));
  };
  writeTasks(initialTasks);
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, unknown>();
  const sent: Array<{ content: string; customType: string }> = [];
  let confirmations = 0;
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
    sendMessage(message: { content: string; customType: string }) { sent.push(message); },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd, mode: "tui", hasUI: true,
    sessionManager: {
      getSessionId: () => "lead", getSessionFile: () => sessionFile,
      getSessionDir: () => join(root, "sessions"),
    },
    ui: { confirm: async () => { confirmations++; return true; } },
  } as unknown as ExtensionContext;
  const discovery = { getAgentConfigDir: () => agentDir } as AgentDiscovery;
  // Only factory-time environment values belong to this lead instance.
  const variables = [
    "PI_TASKS", "PI_TEAM_DIRECTORY", "PI_TEAM_ID", "PI_TEAM_MEMBER_ID",
    "PI_TEAM_MEMBER_TOKEN", "PI_TEAM_CHILD_SESSION_ID", "PI_TEAM_LEAD_SESSION_ID",
    "PI_TEAM_MEMBER_EPOCH",
  ];
  const saved = variables.map((name) => [name, process.env[name]] as const);
  for (const name of variables) delete process.env[name];
  process.env.PI_TASKS = path;
  let runtime: ReturnType<typeof createTeamRuntime>;
  try {
    runtime = createTeamRuntime(pi, discovery, {
      runningSubagents: new Map(),
    } as SubagentRuntime, { sessionActive: true } as SessionState);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  t.after(() => {
    runtime.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  registerTeamEvents(pi, discovery, runtime, () => true);
  runtime.recordSessionStart("startup", ctx);
  const disk = () => {
    const candidate = checkLeadAdmission({
      cwd, agentDir, sessionId: "lead", sessionFile, piTasks: path,
    }, runtime.leadReceipt);
    if (!candidate.ok) throw new Error(candidate.reason);
    return candidate.value;
  };
  const before = disk().storeFingerprint;
  const team = await runtime.openCoordinator(ctx, "review", before);
  team.close(); // Drive notices explicitly rather than polling real timers.
  const emitCall = async (
    toolName: string, toolCallId = "native-call", input: Record<string, unknown> = {},
  ) => {
    const results: unknown[] = [];
    for (const handler of handlers.get("tool_call") ?? []) {
      results.push(await handler({ type: "tool_call", toolName, toolCallId, input }, ctx));
    }
    return results as Array<ToolCallEventResult | undefined>;
  };
  const emitResult = async (
    toolName: string, toolCallId = "native-call", isError = false,
    input: Record<string, unknown> = {},
  ) => {
    const results: unknown[] = [];
    for (const handler of handlers.get("tool_result") ?? []) {
      results.push(await handler({
        type: "tool_result", toolName, toolCallId, input, isError,
        content: [{ type: "text", text: isError ? "Uncertain result" : "Native result" }],
        details: undefined,
      }, ctx));
    }
    return results as Array<ToolResultEventResult | undefined>;
  };
  const state = () => team.transport.getTaskState(team.teamId);
  const member = await team.addMember({ name: "Alice", sessionId: "child" });
  const mailbox = createMemberMailbox({
    directory: team.directory, teamId: team.teamId, leadSessionId: "lead",
    member: { ...member, sessionId: "child" },
  });
  const requestApproval = async (toolCallId = "member-call") => {
    const request = makeApprovalRequest({
      toolName: "TaskUpdate", input: { taskId: "1", status: "in_progress" },
      toolCallId, memberId: member.memberId, memberEpoch: member.epoch,
      memberSessionId: "child", leadSessionId: "lead",
    });
    await mailbox.notice({
      kind: "approval_request", requestId: request.requestId, body: JSON.stringify(request),
    });
    await team.drain();
    return request;
  };
  return {
    root, path, agentDir, ctx, runtime, team, before, disk, state, writeTasks,
    emitCall, emitResult, tools, sent, member, mailbox, requestApproval,
    get confirmations() { return confirmations; },
  };
}

for (const toolName of ["TaskCreate", "TaskUpdate", "TaskExecute", "TaskStop"]) {
  test(`registered ${toolName} result rebases a safe native task change`, async (t) => {
    const f = await fixture(t);
    await f.emitCall(toolName, "parent/1");
    f.writeTasks([task("1", "in_progress"), task("2")]);
    await f.emitResult(toolName, "parent/1");
    assert.deepEqual(await f.state(), {
      fingerprint: f.disk().storeFingerprint, pauseReason: undefined,
    });
    assert.notEqual(f.disk().storeFingerprint, f.before);
    assert.deepEqual(f.sent, []);
  });
}

test("registered hooks delegate native task safety without exposing mutable runtime state", async (t) => {
  const f = await fixture(t);
  assert.equal("leadRecoveries" in f.runtime, false);
  assert.equal("invalidateApprovals" in f.runtime, false);
  const calls: Array<{ toolName: string; toolCallId: string }> = [];
  const results: Array<{ toolName: string; toolCallId: string; isError: boolean }> = [];
  t.mock.method(f.runtime, "observeNativeTaskCall", (
    event: Pick<ToolCallEvent, "toolName" | "toolCallId">, ctx: ExtensionContext,
  ) => {
    assert.equal(ctx, f.ctx);
    calls.push({ toolName: event.toolName, toolCallId: event.toolCallId });
  });
  t.mock.method(f.runtime, "reconcileNativeTaskResult", async (
    event: Pick<ToolResultEvent, "toolName" | "toolCallId" | "isError">, ctx: ExtensionContext,
  ) => {
    assert.equal(ctx, f.ctx);
    results.push({ toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError });
  });
  await f.emitCall("TaskCreate", "delegated");
  await f.emitResult("TaskCreate", "delegated", true);
  assert.deepEqual(calls, [{ toolName: "TaskCreate", toolCallId: "delegated" }]);
  assert.deepEqual(results, [{ toolName: "TaskCreate", toolCallId: "delegated", isError: true }]);
});

test("registered hooks ignore reads and keep the native TaskStop teammate veto", async (t) => {
  const f = await fixture(t);
  assert.deepEqual([...f.tools.keys()], ["TeamStop"]);
  const call = await f.emitCall("TaskStop", "stop", { task_id: `team:${f.member.memberId}` });
  assert.equal(call[0]?.block, true);
  assert.match(call[0]?.reason ?? "", /Use TeamStop/);
  const alias = await f.emitCall("TaskStop", "alias", { shell_id: `team:${f.member.memberId}` });
  assert.equal(alias[0]?.block, true);
  f.writeTasks([task("1", "in_progress")]);
  await f.emitResult("TaskList");
  assert.deepEqual(await f.state(), { fingerprint: f.before, pauseReason: undefined });
});

test("registered TaskCreate recovery retains completed task IDs and dependency history", async (t) => {
  const history = completedHistory();
  const f = await fixture(t, history);
  await f.emitCall("TaskCreate");
  f.writeTasks([...history, task("3")]);
  await f.emitResult("TaskCreate");
  assert.deepEqual(await f.state(), {
    fingerprint: f.disk().storeFingerprint, pauseReason: undefined,
  });
  assert.deepEqual(f.disk().tasks.slice(0, 2), history);
  assert.deepEqual(f.sent, []);
});

for (const loss of ["lost completed tasks", "changed status", "changed blocks", "changed blockedBy"]) {
  test(`successful registered TaskCreate pauses for ${loss} instead of rebasing`, async (t) => {
    const history = completedHistory();
    const f = await fixture(t, history);
    await f.emitCall("TaskCreate");
    const changed = structuredClone(history);
    if (loss === "lost completed tasks") changed.splice(0);
    if (loss === "changed status") changed[0].status = "pending";
    if (loss === "changed blocks") changed[0].blocks = [];
    if (loss === "changed blockedBy") changed[1].blockedBy = [];
    f.writeTasks([...changed, task("3")]);
    await f.emitResult("TaskCreate");
    assert.deepEqual(await f.state(), {
      fingerprint: f.before,
      pauseReason: "Lead pending-task recovery did not retain completed history or had an uncertain result",
    });
    assert.equal(f.sent.length, 1);
    await f.emitResult("TaskUpdate", "later");
    assert.equal((await f.state()).fingerprint, f.before, "a later native result must not clear the hold");
    assert.equal(f.sent.length, 1);
  });
}

for (const retainHistory of [true, false]) {
  test(`uncertain registered TaskCreate recovery pauses with ${retainHistory ? "retained" : "lost"} history`, async (t) => {
    const history = completedHistory();
    const f = await fixture(t, history);
    await f.emitCall("TaskCreate");
    f.writeTasks(retainHistory ? [...history, task("3")] : [task("3")]);
    await f.emitResult("TaskCreate", "native-call", true);
    assert.deepEqual(await f.state(), {
      fingerprint: f.before,
      pauseReason: "Lead pending-task recovery did not retain completed history or had an uncertain result",
    });
    assert.equal(f.sent.length, 1);
    await f.emitResult("TaskUpdate", "later");
    assert.equal((await f.state()).fingerprint, f.before);
    assert.equal(f.sent.length, 1, "an existing hold must not send another pause notice");
  });
}

test("an unchanged errored native result keeps the baseline and existing approvals", async (t) => {
  const f = await fixture(t);
  const request = await f.requestApproval();
  await f.emitResult("TaskUpdate", "native-noop", true);
  f.writeTasks([task("1", "in_progress")]);
  await f.mailbox.notice({
    kind: "result", requestId: "commit",
    body: JSON.stringify({
      type: "task_commit", approvalRequestId: request.requestId,
      digest: request.digest, toolCallId: request.toolCallId,
      previous: f.before, next: f.disk().storeFingerprint,
    }),
  });
  await f.team.drain();
  assert.deepEqual(await f.state(), { fingerprint: f.disk().storeFingerprint, pauseReason: undefined });
  assert.deepEqual(await f.team.transport.receiveNotices(f.team.teamId), []);
});

for (const pauseReason of [LEGACY_NATIVE_TASK_HOLD, "Committed result was not delivered"]) {
  test(`registered native reconciliation selectively handles the ${pauseReason} hold`, async (t) => {
    const f = await fixture(t);
    await f.team.transport.pauseTaskWrites(f.team.teamId, pauseReason);
    f.writeTasks([task("1", "in_progress")]);
    await f.emitResult("TaskUpdate");
    const recoverable = pauseReason === LEGACY_NATIVE_TASK_HOLD;
    assert.deepEqual(await f.state(), {
      fingerprint: recoverable ? f.disk().storeFingerprint : f.before,
      pauseReason: recoverable ? undefined : pauseReason,
    });
    assert.deepEqual(f.sent, []);
  });
}

test("completed-list recovery cannot clear an uncertain hold", async (t) => {
  const history = completedHistory();
  const f = await fixture(t, history);
  await f.emitCall("TaskCreate");
  await f.team.transport.pauseTaskWrites(f.team.teamId, "Uncertain task commit");
  f.writeTasks([...history, task("3")]);
  await f.emitResult("TaskCreate");
  assert.deepEqual(await f.state(), { fingerprint: f.before, pauseReason: "Uncertain task commit" });
  assert.deepEqual(f.sent, [], "an existing uncertain hold must not send another pause notice");
});

test("a stale completed-list recovery snapshot cannot rebase over a teammate baseline", async (t) => {
  const history = completedHistory();
  const f = await fixture(t, history);
  await f.emitCall("TaskCreate");
  await f.team.transport.recordObservedTaskChange({
    teamId: f.team.teamId, previous: f.before, next: "competing-commit",
  });
  f.writeTasks([...history, task("3")]);
  await f.emitResult("TaskCreate");
  assert.deepEqual(await f.state(), {
    fingerprint: "competing-commit",
    pauseReason: "Lead pending-task recovery did not retain completed history or had an uncertain result",
  });
  assert.equal(f.sent.length, 1);
});

for (const drift of ["task file", "configuration", "session receipt"]) {
  test(`registered native results pause when the ${drift} is unsafe`, async (t) => {
    const f = await fixture(t);
    if (drift === "task file") writeFileSync(f.path, '{"tasks":"invalid"}');
    if (drift === "configuration") {
      writeFileSync(join(f.agentDir, "tasks-config.json"),
        '{"autoClearCompleted":"never","taskScope":"project"}');
    }
    if (drift === "session receipt") f.runtime.recordSessionStart("switch", f.ctx);
    await f.emitResult("TaskUpdate");
    const state = await f.state();
    assert.equal(state.fingerprint, f.before);
    assert.match(state.pauseReason ?? "", drift === "task file" ? /Invalid task envelope/
      : drift === "configuration" ? /configuration changed/ : /receipt is absent/);
    assert.equal(f.sent.length, 1);
  });
}

test("registered native rebase retains the locked compare-and-swap when another commit wins", async (t) => {
  const f = await fixture(t);
  f.writeTasks([task("1", "in_progress")]);
  const getState = f.team.transport.getTaskState;
  t.mock.method(f.team.transport, "getTaskState", async (teamId: string) => {
    const snapshot = await getState(teamId);
    await f.team.transport.recordObservedTaskChange({
      teamId, previous: snapshot.fingerprint!, next: "competing-commit",
    });
    return snapshot;
  });
  await f.emitResult("TaskUpdate");
  t.mock.restoreAll();
  assert.deepEqual(await f.state(), {
    fingerprint: "competing-commit", pauseReason: "Uncorrelated task change or commit",
  });
});

for (const conflict of ["competing baseline", "uncertain hold"]) {
  test(`registered completed-list recovery pauses when ${conflict} wins the roster lock`, async (t) => {
    const history = completedHistory();
    const f = await fixture(t, history);
    await f.emitCall("TaskCreate");
    f.writeTasks([...history, task("3")]);
    const recover = f.team.transport.recordLeadRecovery;
    t.mock.method(f.team.transport, "recordLeadRecovery", async (input: Parameters<typeof recover>[0]) => {
      if (conflict === "competing baseline") {
        await f.team.transport.recordObservedTaskChange({
          teamId: input.teamId, previous: input.previous, next: "competing-commit",
        });
      } else {
        await f.team.transport.pauseTaskWrites(input.teamId, "Uncertain task commit");
      }
      await recover(input);
    });
    await f.emitResult("TaskCreate");
    t.mock.restoreAll();
    assert.deepEqual(await f.state(), {
      fingerprint: conflict === "competing baseline" ? "competing-commit" : f.before,
      pauseReason: conflict === "competing baseline"
        ? "Lead pending-task recovery did not retain completed history or had an uncertain result"
        : "Uncertain task commit",
    });
  });
}

for (const recovery of [false, true]) {
  test(`accepted native ${recovery ? "completed-list recovery" : "rebase"} invalidates a pending lead approval`, async (t) => {
    const history = recovery ? completedHistory() : [task("1")];
    const f = await fixture(t, history);
    // A failed send leaves the request pending after the real lead records its answer.
    const sendFromLead = f.team.transport.sendFromLead;
    t.mock.method(f.team.transport, "sendFromLead", async () => { throw new Error("Mailbox unavailable"); });
    const request = await f.requestApproval();
    assert.equal(f.confirmations, 1);
    t.mock.restoreAll();
    const toolName = recovery ? "TaskCreate" : "TaskUpdate";
    await f.emitCall(toolName);
    f.writeTasks(recovery ? [...history, task("3")] : [task("1", "in_progress")]);
    await f.emitResult(toolName);
    await f.team.drain();
    assert.equal(f.confirmations, 1, "an invalidated request must not be approved again");
    assert.deepEqual(await f.mailbox.receive(), [], "no stale approval response may be delivered");
    assert.deepEqual(await f.team.transport.receiveNotices(f.team.teamId), []);
    assert.equal((await f.state()).pauseReason, undefined);
    // Keep the correlation evidence observable without inspecting private answer maps.
    assert.equal(request.memberId, f.member.memberId);
    assert.equal(typeof sendFromLead, "function");
  });
}

test("the real lead grants exact task approval and correlates a teammate commit", async (t) => {
  const f = await fixture(t);
  const request = await f.requestApproval();
  const responses = await f.mailbox.receive();
  assert.equal(responses.length, 1);
  const answer = JSON.parse(responses[0].body) as ApprovalResponse;
  assert.equal(answer.approved, true);
  assert.equal(answer.digest, request.digest);
  assert.equal(answer.toolCallId, request.toolCallId);
  assert.equal(f.confirmations, 1);
  f.writeTasks([task("1", "in_progress")]);
  await f.mailbox.notice({
    kind: "result", requestId: "commit",
    body: JSON.stringify({
      type: "task_commit", approvalRequestId: request.requestId, digest: request.digest,
      toolCallId: request.toolCallId, previous: f.before, next: f.disk().storeFingerprint,
    }),
  });
  await f.team.drain();
  assert.deepEqual(await f.state(), { fingerprint: f.disk().storeFingerprint, pauseReason: undefined });
  assert.deepEqual(await f.team.transport.receiveNotices(f.team.teamId), []);
  assert.deepEqual(f.sent, [], "task commit receipts must not become ordinary teammate messages");
});

for (const forgery of ["missing grant", "digest", "tool call", "stale next fingerprint", "stale previous fingerprint", "invalidated grant"]) {
  test(`the real lead pauses task writes for a ${forgery} receipt`, async (t) => {
    const f = await fixture(t);
    const request = await f.requestApproval();
    let previous = f.before;
    if (forgery === "invalidated grant") {
      f.writeTasks([task("1", "in_progress")]);
      await f.emitResult("TaskUpdate");
      previous = f.disk().storeFingerprint;
    }
    f.writeTasks([task("1", "completed")]);
    await f.mailbox.notice({
      kind: "result", requestId: "forged-commit",
      body: JSON.stringify({
        type: "task_commit",
        approvalRequestId: forgery === "missing grant" ? "unknown" : request.requestId,
        digest: forgery === "digest" ? "wrong" : request.digest,
        toolCallId: forgery === "tool call" ? "another-call" : request.toolCallId,
        previous: forgery === "stale previous fingerprint" ? "stale-baseline" : previous,
        next: forgery === "stale next fingerprint" ? f.before : f.disk().storeFingerprint,
      }),
    });
    await f.team.drain();
    assert.deepEqual(await f.state(), {
      fingerprint: previous, pauseReason: "Uncorrelated or conflicting teammate task commit",
    });
    const pending = await f.team.transport.receiveNotices(f.team.teamId);
    assert.equal(pending.length, 1, "uncorrelated commits must remain unacknowledged");
    assert.deepEqual(f.sent, []);
  });
}

test("the real lead pauses when a teammate commit loses the locked baseline comparison", async (t) => {
  const f = await fixture(t);
  const request = await f.requestApproval();
  f.writeTasks([task("1", "in_progress")]);
  const commit = f.team.transport.recordTaskCommit;
  t.mock.method(f.team.transport, "recordTaskCommit", async (input: Parameters<typeof commit>[0]) => {
    await f.team.transport.recordObservedTaskChange({
      teamId: input.teamId, previous: input.previous, next: "competing-commit",
    });
    await commit(input);
  });
  await f.mailbox.notice({
    kind: "result", requestId: "racing-commit",
    body: JSON.stringify({
      type: "task_commit", approvalRequestId: request.requestId,
      digest: request.digest, toolCallId: request.toolCallId,
      previous: f.before, next: f.disk().storeFingerprint,
    }),
  });
  await f.team.drain();
  t.mock.restoreAll();
  assert.deepEqual(await f.state(), {
    fingerprint: "competing-commit", pauseReason: "Uncorrelated or conflicting teammate task commit",
  });
  assert.equal((await f.team.transport.receiveNotices(f.team.teamId)).length, 1);
  assert.deepEqual(f.sent, []);
});
