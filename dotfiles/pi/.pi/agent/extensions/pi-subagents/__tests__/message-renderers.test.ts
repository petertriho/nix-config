import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerMessageRenderers } from "../presentation/message-renderers.ts";
import { summarizeSubagentUsage } from "../telemetry/usage.ts";

test("result usage rendering removes terminal controls without changing model identity", () => {
  const renderers = new Map<string, Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>();
  registerMessageRenderers({
    registerMessageRenderer(
      name: string,
      renderer: Parameters<ExtensionAPI["registerMessageRenderer"]>[1],
    ) {
      renderers.set(name, renderer);
    },
  } as unknown as ExtensionAPI);
  const model = "model\x1b]52;c;Y2xpcGJvYXJk\x07";
  const usage = summarizeSubagentUsage([{
    type: "message",
    message: {
      role: "assistant",
      provider: "test",
      model,
      stopReason: "stop",
      usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12 },
    },
  }]);
  const renderer = renderers.get("subagent_result");
  assert.ok(renderer);
  const component = renderer({
    role: "custom",
    customType: "subagent_result",
    content: "Completed.",
    display: true,
    timestamp: Date.now(),
    details: { name: "Worker", exitCode: 0, elapsed: 1, usage },
  }, { expanded: true, outputPad: 1 }, {
    fg: (_token: unknown, value: string) => value,
    bg: (_token: unknown, value: string) => value,
    bold: (value: string) => value,
  } as never);
  assert.ok(component);
  const rendered = component.render(200).join("\n");
  assert.doesNotMatch(rendered, /\x1b\]52;/);
  assert.match(rendered, /test\/model/);
  assert.equal(usage.model, model);
});
