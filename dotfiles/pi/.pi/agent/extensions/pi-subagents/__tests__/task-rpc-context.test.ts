import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createTaskRpcAdapter } from "../runtime/task-rpc.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { ExecutionRuntime } from "../runtime/execution.ts";
import type { SubagentRuntime } from "../runtime/refresh.ts";
import { SUBAGENTS_COMPLETED_CHANNEL, type RpcEventBus } from "../tasks/rpc.ts";

type LaunchArguments = Parameters<ExecutionRuntime["launchSubagent"]>;
type RunningSubagent = Awaited<ReturnType<ExecutionRuntime["launchSubagent"]>>;

function createHarness() {
  const root = mkdtempSync(join(tmpdir(), "pi-task-context-"));
  const agents = join(root, "agents");
  const cwd = join(root, "project");
  mkdirSync(agents);
  mkdirSync(cwd);
  writeFileSync(join(agents, "context-probe.md"), [
    "---",
    "name: context-probe",
    "auto-exit: true",
    `cwd: ${join(root, "other-checkout")}`,
    "---",
    "Perform the assigned task.",
  ].join("\n"));
  const launches: LaunchArguments[] = [];
  const runningSubagents = new Map<string, RunningSubagent>();
  const adapter = createTaskRpcAdapter({
    getAgentConfigDir: () => join(root, "config"),
    getBundledAgentsDir: () => agents,
  } as unknown as AgentDiscovery, {
    runningSubagents,
    startWidgetRefresh() {},
    startStatusRefresh() {},
  } as unknown as SubagentRuntime, {
    async launchSubagent(...args: LaunchArguments) {
      launches.push(args);
      const running = {
        id: `run-${launches.length}`,
        name: args[0].name,
        task: args[0].task,
        surface: `invalid-test-surface-${root}`,
        sessionFile: join(root, `run-${launches.length}.jsonl`),
      } as RunningSubagent;
      runningSubagents.set(running.id, running);
      return running;
    },
    async watchSubagent(running: RunningSubagent) {
      runningSubagents.delete(running.id);
      return {
        name: running.name,
        task: running.task,
        summary: "Completed.",
        exitCode: 0,
        elapsed: 0,
        responded: true,
      };
    },
  } as unknown as ExecutionRuntime);
  const model = { provider: "test", id: "parent", name: "Parent" };
  const ctx = {
    cwd,
    model,
    modelRegistry: { getAvailable: () => [model] },
    ui: { notify() {} },
  } as unknown as ExtensionContext;
  return {
    adapter,
    ctx,
    launches,
    cleanup() {
      adapter.shutdownPiTasksRpcBridge();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("task RPC pins the launch directory even when the agent profile sets another cwd", async () => {
  const harness = createHarness();
  try {
    await harness.adapter.resolveAndLaunchTaskRpc(
      {} as ExtensionAPI,
      { ...harness.ctx, pi: {} as ExtensionAPI },
      { type: "context-probe", prompt: "Update this checkout.", options: { isBackground: true } },
    );
    assert.equal(harness.launches.length, 1);
    assert.equal(harness.launches[0][0].cwd, harness.ctx.cwd);
  } finally {
    harness.cleanup();
  }
});

test("task RPC resolves the current parent model after attachment", { timeout: 5_000 }, async () => {
  const harness = createHarness();
  const emitter = new EventEmitter();
  const events: RpcEventBus = {
    on(channel, handler) {
      emitter.on(channel, handler);
      return () => { emitter.off(channel, handler); };
    },
    emit(channel, data) {
      emitter.emit(channel, data);
    },
  };
  const pi = { events } as unknown as ExtensionAPI;
  const initialModel = harness.ctx.model;
  const nextModel = { ...initialModel, id: "next-parent", name: "Next parent" };
  let currentModel = initialModel;
  Object.defineProperty(harness.ctx, "model", {
    enumerable: true,
    configurable: true,
    get: () => currentModel,
  });
  const childKeys = ["PI_SUBAGENT_ID", "PI_SUBAGENT_SESSION"] as const;
  const previousMarkers = childKeys.map((key) => process.env[key]);
  for (const key of childKeys) delete process.env[key];
  try {
    await harness.adapter.attachPiTasksRpcBridge(pi, harness.ctx);
    assert.ok(harness.adapter.getAttachedTaskRpcForTests());
    currentModel = nextModel as ExtensionContext["model"];
    const completed = new Promise<void>((resolve) => {
      const unsubscribe = events.on(SUBAGENTS_COMPLETED_CHANNEL, () => {
        unsubscribe();
        resolve();
      });
    });
    const requestId = "current-parent-model";
    const reply = new Promise<{ success: boolean; error?: string }>((resolve) => {
      const unsubscribe = events.on(`subagents:rpc:spawn:reply:${requestId}`, (data) => {
        unsubscribe();
        resolve(data as { success: boolean; error?: string });
      });
    });
    events.emit("subagents:rpc:spawn", {
      requestId,
      type: "context-probe",
      prompt: "Update this checkout.",
      options: { isBackground: true },
    });
    const response = await reply;
    assert.equal(response.success, true, response.error);
    await completed;
    assert.equal(harness.launches.length, 1);
    assert.equal(harness.launches[0][2]?.resolvedModel?.model.id, nextModel.id);
    assert.equal(harness.launches[0][1].model, currentModel);
  } finally {
    harness.cleanup();
    emitter.removeAllListeners();
    childKeys.forEach((key, index) => {
      const value = previousMarkers[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
