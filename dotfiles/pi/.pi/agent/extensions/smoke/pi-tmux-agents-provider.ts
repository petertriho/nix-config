import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";

/**
 * Offline model for the pi-tmux-agents smoke. Never load in production.
 * fake-provider.ts always calls TaskCreate, and this smoke needs other turns.
 * The reply depends on the last user message:
 * - "SLOW <n>": wait n seconds, then reply "slow done". An abort ends it.
 * - "ASK": call SmokeAsk, which opens a confirm dialog, then reply "asked: <answer>".
 * - "PROBE": reply "probe: marker=<yes|no> tools=<sorted tool names>". The
 *   marker is SMOKE-MARKER in the system prompt, from --append-system-prompt.
 * - anything else: reply "echo: <message>".
 */
export default function piTmuxAgentsSmokeProvider(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "SmokeAsk",
    label: "Smoke ask",
    description: "Ask the user a yes or no question.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const answer = await ctx.ui.confirm("Smoke question", "Continue the smoke?");
      return { content: [{ type: "text", text: `answer=${answer}` }], details: {} };
    },
  });

  pi.registerProvider("pta-smoke", {
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1",
    apiKey: "smoke-only",
    models: [{
      id: "mock", name: "Offline pi-tmux-agents smoke", reasoning: false,
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
        const reply = (text: string) => {
          const block = { type: "text" as const, text };
          output.content.push(block);
          stream.push({ type: "text_start", contentIndex: 0, partial: output });
          stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
          stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
          output.stopReason = "stop";
        };
        try {
          stream.push({ type: "start", partial: output });
          const last = context.messages.at(-1) as { role?: string; content?: unknown } | undefined;
          const userMessage = [...context.messages].reverse()
            .find((entry) => entry.role === "user") as { content?: unknown } | undefined;
          const userText = typeof userMessage?.content === "string"
            ? userMessage.content
            : Array.isArray(userMessage?.content)
              ? userMessage.content
                .filter((block: { type?: string }) => block.type === "text")
                .map((block: { text?: string }) => block.text ?? "")
                .join("\n")
              : "";
          if (/\bPROBE\b/.test(userText) && last?.role !== "toolResult") {
            // pi 1.6 sends the system prompt as a leading system message: the
            // appended prompt is in its sections, and its toolsAdded names the
            // tools. Older pi uses context.systemPrompt and context.tools.
            const system = context.messages.filter((entry) => (entry.role as string) === "system") as Array<{
              toolsAdded?: Array<string | { name?: string }>;
            }>;
            const systemText = [context.systemPrompt ?? "", ...system.map((entry) => JSON.stringify(entry))].join("\n");
            const names = new Set((context.tools ?? []).map((tool) => tool.name));
            for (const entry of system) {
              for (const tool of entry.toolsAdded ?? []) names.add(typeof tool === "string" ? tool : tool.name ?? "");
            }
            const tools = [...names].filter(Boolean).sort().join(",");
            reply(`probe: marker=${systemText.includes("SMOKE-MARKER") ? "yes" : "no"} tools=${tools}`);
          } else if (last?.role === "toolResult") {
            const result = Array.isArray(last.content)
              ? last.content.map((block: { text?: string }) => block.text ?? "").join("")
              : "";
            reply(`asked: ${result}`);
          } else if (/\bASK\b/.test(userText)) {
            const call = { type: "toolCall" as const, id: `smoke-ask-${Date.now()}`, name: "SmokeAsk", arguments: {} };
            output.content.push(call);
            stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
            stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: output });
            output.stopReason = "toolUse";
          } else {
            const slow = /\bSLOW (\d+)\b/.exec(userText);
            if (slow) {
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, Number(slow[1]) * 1000);
                options?.signal?.addEventListener("abort", () => {
                  clearTimeout(timer);
                  reject(new Error("aborted"));
                }, { once: true });
              });
              reply("slow done");
            } else {
              reply(`echo: ${userText}`);
            }
          }
          stream.push({ type: "done", reason: output.stopReason, message: output });
          stream.end();
        } catch (error) {
          const aborted = options?.signal?.aborted === true;
          stream.push({
            type: "error", reason: aborted ? "aborted" : "error",
            error: { ...output, stopReason: aborted ? "aborted" : "error", errorMessage: String(error) },
          });
          stream.end();
        }
      })();
      return stream;
    },
  });
}
