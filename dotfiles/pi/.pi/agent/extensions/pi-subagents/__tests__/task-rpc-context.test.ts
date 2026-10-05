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
import {
  SUBAGENTS_COMPLETED_CHANNEL, type RpcEventBus, type TaskRpcRuntimeHooks,
} from "../tasks/rpc.ts";

type LaunchArguments = Parameters<ExecutionRuntime["launchSubagent"]>;
type RunningSubagent = Awaited<ReturnType<ExecutionRuntime["launchSubagent"]>>;

function createHarness(options: { launchError?: Error } = {}) {
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
  const refreshes = { widgets: 0, status: [] as ExtensionAPI[] };
  const adapter = createTaskRpcAdapter({
    getAgentConfigDir: () => join(root, "config"),
    getBundledAgentsDir: () => agents,
  } as unknown as AgentDiscovery, {
    runningSubagents,
    startWidgetRefresh() { refreshes.widgets++; },
    startStatusRefresh(pi: ExtensionAPI) { refreshes.status.push(pi); },
  } as unknown as SubagentRuntime, {
    async launchSubagent(...args: LaunchArguments) {
      launches.push(args);
      if (options.launchError) throw options.launchError;
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
    agents,
    ctx,
    launches,
    runningSubagents,
    refreshes,
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
    assert.deepEqual(harness.launches[0][2]?.taskRuntime, {});
  } finally {
    harness.cleanup();
  }
});

test("task RPC returns the validated spec and launch handle with autonomous controls", async () => {
  const harness = createHarness();
  const pi = {} as ExtensionAPI;
  const ctx = { ...harness.ctx, pi };
  const request = {
    type: "context-probe",
    prompt: "Complete this task.",
    options: {
      isBackground: false,
      description: "Task description",
      model: "test/parent",
      maxTurns: 3,
    },
  };
  try {
    const { spec, handle } = await harness.adapter.resolveAndLaunchTaskRpc(pi, ctx, request);
    assert.equal(spec.type, request.type);
    assert.equal(spec.prompt, request.prompt);
    assert.deepEqual(spec.options, request.options);
    assert.equal(spec.profile.fileName, "context-probe");
    assert.equal(spec.resolvedModel.argument, "test/parent");
    assert.equal(spec.resolvedModel.source, "explicit");
    assert.deepEqual(harness.launches[0][0], {
      name: "Task description",
      task: request.prompt,
      agent: "context-probe",
      cwd: harness.ctx.cwd,
    });
    assert.equal(harness.launches[0][1], ctx);
    assert.deepEqual(harness.launches[0][2], {
      resolvedModel: spec.resolvedModel,
      taskRuntime: { maxTurns: 3 },
    });
    const running = harness.runningSubagents.get(handle.id);
    assert.ok(running);
    assert.equal(handle.surface, running.surface);
    assert.equal(handle.sessionFile, running.sessionFile);
    assert.ok(handle.abortController instanceof AbortController);
    assert.equal(handle.abortController, running.abortController);
    assert.equal(handle.abortController.signal.aborted, false);
    assert.deepEqual(harness.refreshes, { widgets: 1, status: [pi] });
  } finally {
    harness.cleanup();
  }
});

test("task RPC rejects unknown and unsafe profiles before launch or refresh", async () => {
  const harness = createHarness();
  const profiles = [
    ["interactive-probe", "interactive: true", /interactive: true/],
    ["non-exiting-probe", "auto-exit: false", /auto-exit: false/],
    ["cli-probe", "cli: claude", /claude CLI/],
  ] as const;
  try {
    for (const [name, frontmatter] of profiles) {
      writeFileSync(join(harness.agents, `${name}.md`), `---\n${frontmatter}\n---\nDo the work.`);
    }
    for (const [type, error] of [
      ["unknown-task-probe", /Unknown task agent type/],
      ...profiles.map(([name, , error]) => [name, error] as const),
    ] as const) {
      await assert.rejects(
        harness.adapter.resolveAndLaunchTaskRpc(
          {} as ExtensionAPI,
          { ...harness.ctx, pi: {} as ExtensionAPI },
          { type, prompt: "Do not launch.", options: { isBackground: true } },
        ),
        error,
      );
    }
    assert.deepEqual(harness.launches, []);
    assert.equal(harness.runningSubagents.size, 0);
    assert.deepEqual(harness.refreshes, { widgets: 0, status: [] });
  } finally {
    harness.cleanup();
  }
});

test("task RPC rejects unresolved and missing models before launch or refresh", async () => {
  const harness = createHarness();
  const pi = {} as ExtensionAPI;
  try {
    await assert.rejects(
      harness.adapter.resolveAndLaunchTaskRpc(pi, { ...harness.ctx, pi }, {
        type: "context-probe",
        prompt: "Do not launch.",
        options: { isBackground: true, model: "unknown-task-model" },
      }),
      /Model not found: "unknown-task-model"/,
    );
    await assert.rejects(
      harness.adapter.resolveAndLaunchTaskRpc(pi, {
        ...harness.ctx, pi, model: undefined, modelRegistry: { getAvailable: () => [] },
      } as unknown as Parameters<typeof harness.adapter.resolveAndLaunchTaskRpc>[1], {
        type: "context-probe",
        prompt: "Do not launch.",
        options: { isBackground: true },
      }),
      /No model for task agent "context-probe"/,
    );
    assert.deepEqual(harness.launches, []);
    assert.equal(harness.runningSubagents.size, 0);
    assert.deepEqual(harness.refreshes, { widgets: 0, status: [] });
  } finally {
    harness.cleanup();
  }
});

test("task RPC propagates launch failures without starting refresh or creating handles", async () => {
  const launchError = new Error("Task pane launch failed.");
  const harness = createHarness({ launchError });
  const pi = {} as ExtensionAPI;
  try {
    await assert.rejects(
      harness.adapter.resolveAndLaunchTaskRpc(pi, { ...harness.ctx, pi }, {
        type: "context-probe",
        prompt: "Attempt the launch.",
        options: { isBackground: true },
      }),
      (error) => error === launchError,
    );
    assert.equal(harness.launches.length, 1);
    assert.equal(harness.runningSubagents.size, 0);
    assert.deepEqual(harness.refreshes, { widgets: 0, status: [] });
  } finally {
    harness.cleanup();
  }
});

test("the legacy task runtime hook factory retains its callable launch helper", async () => {
  const harness = createHarness();
  const pi = {} as ExtensionAPI;
  const ctx = { ...harness.ctx, pi };
  try {
    const { spec } = await harness.adapter.resolveAndLaunchTaskRpc(pi, ctx, {
      type: "context-probe",
      prompt: "Launch with the legacy helper.",
      options: { isBackground: true, maxTurns: 4 },
    });
    const hooks: TaskRpcRuntimeHooks = harness.adapter.createTaskRpcRuntimeHooks(pi, ctx);
    const handle = await hooks.launch(spec);
    assert.equal(handle.id, "run-2");
    assert.deepEqual(harness.launches[1], harness.launches[0]);
    assert.equal(handle.abortController, harness.runningSubagents.get(handle.id)?.abortController);
    assert.deepEqual(harness.refreshes, { widgets: 2, status: [pi, pi] });
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
