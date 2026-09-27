import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

/** Offline model for the isolated real-Pi/tmux smoke. Never load in production. */
export default function fakeProvider(pi: ExtensionAPI): void {
  pi.registerProvider("team-smoke", {
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1",
    apiKey: "smoke-only",
    models: [{
      id: "mock", name: "Offline team smoke", reasoning: false,
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
          const stopProbe = process.env.PI_TEAM_SMOKE_STOP_PROBE === "1";
          const toolName = stopProbe ? "TaskStop" : "TaskCreate";
          const hasTaskResult = context.messages.some((entry) =>
            entry.role === "toolResult" && entry.toolName === toolName);
          if (!hasTaskResult) {
            const call = {
              type: "toolCall" as const, id: stopProbe ? "smoke-stop-probe" : "smoke-task-create",
              name: toolName, arguments: stopProbe
                ? { task_id: "team:probe-member" }
                : { subject: "SmokeTask", description: "Offline team write" },
            };
            output.content.push(call);
            stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
            stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: output });
            output.stopReason = "toolUse";
          } else {
            const text = { type: "text" as const, text: "Smoke task call finished." };
            output.content.push(text);
            stream.push({ type: "text_start", contentIndex: 0, partial: output });
            stream.push({ type: "text_delta", contentIndex: 0, delta: text.text, partial: output });
            stream.push({ type: "text_end", contentIndex: 0, content: text.text, partial: output });
            output.stopReason = "stop";
          }
          stream.push({ type: "done", reason: output.stopReason, message: output });
          stream.end();
        } catch (error) {
          output.stopReason = "stop";
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
