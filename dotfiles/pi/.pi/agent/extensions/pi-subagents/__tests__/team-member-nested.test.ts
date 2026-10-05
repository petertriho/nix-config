import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type ExtensionAPI, type ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type ToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import teamMember from "../team-member.ts";
import { answerApproval, type ApprovalRequest } from "../teams/approval.ts";
import { resolveTaskDiskCandidate } from "../tasks/disk-policy.ts";
import { createTeamTransport } from "../teams/transport.ts";

async function fixture(run: (f: {
  call: (name: string, args: ToolCall["arguments"], id: string) => Promise<void>;
  path: string; pausePath: string; initial: string;
  approvals: ApprovalRequest[];
  nested: Awaited<ReturnType<ExtensionToolContext["executeTool"]>>[];
  nativeCalls: string[]; hookCalls: string[]; resultHooks: string[]; messageEnds: string[];
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
}) => Promise<void>, order = "member-first"): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pi-member-nested-"));
  const cwd = join(root, "workspace"), agentDir = join(root, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
  const path = join(root, "tasks.json");
  const initial = JSON.stringify({ nextId: 2, tasks: [{
    id: "1", subject: "Existing", description: "Keep this task", status: "pending",
    metadata: {}, blocks: [], blockedBy: [], createdAt: 1, updatedAt: 1,
  }] });
  writeFileSync(path, initial);
  const manager = SessionManager.create(cwd, join(root, "sessions"));
  const sessionId = manager.getSessionId();
  const disk = { cwd, agentDir, sessionId, sessionFile: manager.getSessionFile(), piTasks: path };
  const candidate = resolveTaskDiskCandidate(disk);
  assert.ok(candidate.ok);
  const directory = join(root, "team");
  const lead = { sessionId: "lead", epoch: randomUUID(), token: randomUUID() };
  const transport = createTeamTransport({ directory, lead });
  await transport.createTeam("main", "main", candidate.storeFingerprint);
  const member = { memberId: "alice", name: "Alice", sessionId, token: randomUUID(), epoch: 1 };
  await transport.addMember({ teamId: "main", member });
  const vars = {
    PI_TEAM_DIRECTORY: directory, PI_TEAM_ID: "main", PI_TEAM_MEMBER_ID: member.memberId,
    PI_TEAM_MEMBER_TOKEN: member.token, PI_TEAM_MEMBER_EPOCH: "1",
    PI_TEAM_CHILD_SESSION_ID: sessionId, PI_TEAM_LEAD_SESSION_ID: "lead",
    PI_TASKS: path, PI_CODING_AGENT_DIR: agentDir, PI_SUBAGENT_NAME: "Alice",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const approvals: ApprovalRequest[] = [], nativeCalls: string[] = [], hookCalls: string[] = [];
  const resultHooks: string[] = [], messageEnds: string[] = [], errors: string[] = [];
  const nested: Awaited<ReturnType<ExtensionToolContext["executeTool"]>>[] = [];
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false }, retry: { enabled: false },
  });
  const model = {
    provider: "team-test", id: "offline", name: "Offline", api: "anthropic-messages" as const,
    baseUrl: "https://unused.test", reasoning: false, input: ["text" as const],
    contextWindow: 200_000, maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const nativeHook = (pi: ExtensionAPI) => {
      pi.on("tool_call", (event) => {
        if (event.toolName === "TaskCreate" || event.toolName === "TaskUpdate") {
          hookCalls.push(event.toolCallId);
        }
      });
    };
    const resourceLoader = new DefaultResourceLoader({
      cwd, agentDir, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
      extensionFactories: [
        ...(order === "native-first" ? [nativeHook, teamMember] : [teamMember, nativeHook]),
        (pi) => {
          pi.registerProvider(model.provider, {
            api: model.api, baseUrl: model.baseUrl, apiKey: "test-only", models: [model],
          });
          // Native execution must never run, even when the team hook intercepts a write.
          for (const name of ["TaskCreate", "TaskUpdate"]) {
            pi.registerTool({
              name, label: name, description: "Native task execution boundary",
              parameters: Type.Record(Type.String(), Type.Unknown()),
              async execute() {
                nativeCalls.push(name);
                throw new Error("Native task execution must not run");
              },
            });
          }
          // A safe-listed caller still cannot bypass the task mutation guard.
          pi.registerTool({
            name: "read", label: "Nested probe", description: "Probe a nested task call",
            parameters: Type.Object({
              toolName: Type.String(), args: Type.Record(Type.String(), Type.Unknown()),
            }),
            async execute(_id, params, signal, _update, ctx) {
              const outcome = await ctx.executeTool(params.toolName, params.args, { signal });
              nested.push(outcome);
              return { content: outcome.result.content, details: {} };
            },
          });
          pi.on("tool_result", (event) => { resultHooks.push(event.toolCallId); });
          pi.on("message_end", (event) => {
            if (event.message.role === "toolResult") messageEnds.push(event.message.toolCallId);
          });
        },
      ],
    });
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({
      authPath: join(root, "auth.json"), modelsPath: join(root, "models.json"),
      modelsStorePath: join(root, "models-store.json"),
    });
    ({ session } = await createAgentSession({
      cwd, agentDir, settingsManager, resourceLoader, modelRuntime, model,
      sessionManager: manager, noTools: "builtin",
    }));
    session.extensionRunner.onError((error) => { errors.push(error.error); });
    let nextCall: ToolCall | undefined;
    session.agent.streamFunction = () => {
      const call = nextCall;
      nextCall = undefined;
      const stream = createAssistantMessageEventStream();
      const reason = call ? "toolUse" : "stop";
      stream.push({ type: "done", reason, message: {
        role: "assistant", content: call ? [call] : [], api: model.api,
        provider: model.provider, model: model.id, stopReason: reason, timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      } });
      return stream;
    };
    await session.bindExtensions({ uiContext: { notify() {} } as any });
    assert.deepEqual(errors, []);
    const answerNotices = async () => {
      for (const notice of await transport.receiveNotices("main")) {
        if (notice.kind === "approval_request") {
          const request = JSON.parse(notice.body) as ApprovalRequest;
          approvals.push(request);
          await transport.sendFromLead({
            teamId: "main", to: member.memberId, kind: "approval_response",
            requestId: request.requestId, body: JSON.stringify(answerApproval(request, true)),
          });
        } else if (notice.kind === "result") {
          const commit = JSON.parse(notice.body);
          await transport.recordTaskCommit({
            teamId: "main", memberId: member.memberId, epoch: member.epoch,
            previous: commit.previous, next: commit.next,
          });
        }
        await transport.ackNotice({ teamId: "main", messageId: notice.id });
      }
    };
    const activeSession = session;
    await run({
      async call(name, args, id) {
        nextCall = { type: "toolCall", name, arguments: args, id };
        let done = false;
        const prompt = activeSession.prompt("Run the supplied test call.").finally(() => { done = true; });
        while (!done) {
          await answerNotices();
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await prompt;
        await answerNotices();
        assert.deepEqual(errors, []);
      },
      path, pausePath: join(directory, "main", "pause-alice.json"), initial,
      approvals, nested, nativeCalls, hookCalls, resultHooks, messageEnds, session,
    });
  } finally {
    if (session) {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      session.dispose();
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

for (const toolName of ["TaskCreate", "TaskUpdate"]) {
  test(`SDK nested ${toolName} is refused before approval without a write or persistent pause`, { timeout: 10_000 }, async () => {
    await fixture(async (f) => {
      await f.call("read", {
        toolName, args: toolName === "TaskCreate"
          ? { subject: "Nested", description: "Must not commit" }
          : { taskId: "1", subject: "Nested change", status: "in_progress", owner: "Alice" },
      }, "outer");
      assert.equal(f.nested.length, 1, "the actual SDK must deliver the nested outcome to its caller");
      const outcome = f.nested[0];
      const text = outcome.result.content[0];
      assert.equal(text.type, "text");
      assert.deepEqual({
        approvals: f.approvals.map((request) => request.toolName),
        taskUnchanged: readFileSync(f.path, "utf8") === f.initial,
        nativeCalls: f.nativeCalls,
        isError: outcome.isError,
        sentinel: text.text.startsWith("TEAM_INTERCEPTED_"),
        paused: existsSync(f.pausePath),
      }, {
        approvals: [], taskUnchanged: true, nativeCalls: [], isError: true, sentinel: false, paused: false,
      });
      assert.match(text.text, new RegExp(`nested ${toolName}.*direct`, "i"));
      assert.deepEqual(f.resultHooks, ["outer"], "blocked nested calls do not emit tool_result");
      assert.deepEqual(f.messageEnds, ["outer"], "nested calls have no transcript message_end");
      assert.equal(f.session.messages.some((message) =>
        message.role === "toolResult" && message.toolCallId === "outer/1"), false);
    });
  });
}

test("SDK teammate shutdown clears unfinished nested execution metadata before reload", { timeout: 10_000 }, async () => {
  await fixture(async (f) => {
    await f.session.extensionRunner.emit(Object.freeze({
      type: "tool_execution_start", toolName: "TaskCreate", toolCallId: "reused/opaque/id",
      args: {}, parentToolCallId: "interrupted-parent",
    }));
    await f.session.extensionRunner.emit({ type: "session_shutdown", reason: "reload" });
    await f.session.extensionRunner.emit({ type: "session_start", reason: "reload" });
    await f.call("TaskCreate", { subject: "After reload", description: "Direct write" }, "reused/opaque/id");
    assert.equal(f.approvals.length, 1);
    assert.equal(f.approvals[0].toolCallId, "reused/opaque/id");
    assert.deepEqual(f.nativeCalls, []);
    const result = f.session.messages.find((message) =>
      message.role === "toolResult" && message.toolCallId === "reused/opaque/id");
    assert.equal(result?.role, "toolResult");
    assert.equal(result.isError, false);
    assert.equal(JSON.parse(readFileSync(f.path, "utf8")).tasks[1].subject, "After reload");
    assert.equal(existsSync(f.pausePath), false);
  });
});

for (const order of ["native-first", "member-first"]) {
  test(`SDK direct task writes still commit with approval after nested refusal (${order})`, { timeout: 10_000 }, async () => {
    await fixture(async (f) => {
      await f.call("read", {
        toolName: "TaskCreate", args: { subject: "Nested", description: "Must not commit" },
      }, "outer");
      // Reuse the exact finished nested ID as an opaque model-issued ID.
      await f.call("TaskCreate", { subject: "Direct", description: "Approved direct create" }, "outer/1");
      await f.call("TaskUpdate", { taskId: "2", owner: "Alice", status: "in_progress" }, "opaque/model/id");
      assert.deepEqual(f.approvals.map(({ toolName, toolCallId }) => ({ toolName, toolCallId })), [
        { toolName: "TaskCreate", toolCallId: "outer/1" },
        { toolName: "TaskUpdate", toolCallId: "opaque/model/id" },
      ]);
      assert.deepEqual(f.nativeCalls, []);
      assert.deepEqual(f.hookCalls, order === "native-first" ? ["outer/1", "outer/1", "opaque/model/id"] : []);
      const tasks = JSON.parse(readFileSync(f.path, "utf8")).tasks;
      assert.equal(tasks.length, 2);
      assert.equal(tasks[0].subject, "Existing");
      assert.equal(tasks[1].subject, "Direct");
      assert.equal(tasks[1].owner, "Alice");
      assert.equal(tasks[1].status, "in_progress");
      const results = f.session.messages.filter((message) => message.role === "toolResult" && message.toolName !== "read");
      assert.equal(results.length, 2);
      for (const message of results) {
        assert.equal(message.role, "toolResult");
        assert.equal(message.isError, false);
        assert.match(message.content[0].type === "text" ? message.content[0].text : "", /committed: #2 Direct/);
        assert.deepEqual(message.details, { team: "main", memberId: "alice", committed: true });
      }
      assert.equal(existsSync(f.pausePath), false);
    }, order);
  });
}
