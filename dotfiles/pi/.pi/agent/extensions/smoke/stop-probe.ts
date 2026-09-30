import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";

/**
 * Offline direct/nested probes of the production TeamStop tool. This session
 * owns no team, so both refusals must be explicit errors. Never load in production.
 */
export default function stopProbe(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "TeamStopProbe",
    label: "Nested stop probe",
    exposure: "model-only",
    description: "Probe the production TeamStop through ctx.executeTool.",
    parameters: Type.Object({ task_id: Type.String() }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outcome = await ctx.executeTool("TeamStop", params, { signal });
      return { ...outcome.result, isError: outcome.isError };
    },
  });
  pi.registerProvider("team-stop-probe", {
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1",
    apiKey: "smoke-only",
    models: [{
      id: "mock", name: "Offline stop probe", reasoning: false,
      input: ["text"], contextWindow: 16_000, maxTokens: 512,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      void (async () => {
        const output = {
          role: "assistant" as const,
          content: [] as Array<{ type: "text"; text: string } | {
            type: "toolCall"; id: string; name: string; arguments: Record<string, string>;
          }>,
          api: model.api, provider: model.provider, model: model.id,
          usage: {
            input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "pending" as "pending" | "toolUse" | "stop",
          timestamp: Date.now(),
        };
        try {
          await options?.onPayload?.({ smoke: true });
          await options?.onResponse?.(new Response(null, { status: 200 }));
          stream.push({ type: "start", partial: output });
          const name = ["TeamStop", "TeamStopProbe"].find((toolName) =>
            !context.messages.some((entry) => entry.role === "toolResult" && entry.toolName === toolName));
          if (name) {
            const call = {
              type: "toolCall" as const, id: `smoke-${name}`, name,
              arguments: { task_id: "team:00000000-0000-4000-8000-000000000000" },
            };
            output.content.push(call);
            stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
            stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: output });
            output.stopReason = "toolUse";
          } else {
            const text = { type: "text" as const, text: "Direct and nested stop probes finished." };
            output.content.push(text);
            stream.push({ type: "text_start", contentIndex: 0, partial: output });
            stream.push({ type: "text_delta", contentIndex: 0, delta: text.text, partial: output });
            stream.push({ type: "text_end", contentIndex: 0, content: text.text, partial: output });
            output.stopReason = "stop";
          }
          stream.push({ type: "done", reason: output.stopReason, message: output });
          stream.end();
        } catch (error) {
          stream.push({
            type: "error", reason: "error",
            error: { ...output, stopReason: "error", errorMessage: String(error) },
          });
          stream.end();
        }
      })();
      return stream;
    },
  });
}
