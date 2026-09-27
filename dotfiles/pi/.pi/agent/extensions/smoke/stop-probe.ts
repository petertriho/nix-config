import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Real Pi blocked-call/message_end routing probe; not a production extension. */
export default function stopProbe(pi: ExtensionAPI): void {
  const blocked = new Map<string, string>();
  pi.on("tool_call", (event) => {
    if (event.toolName !== "TaskStop" || event.input.task_id !== "team:probe-member") return;
    const sentinel = `STOP_PROBE_${event.toolCallId}`;
    blocked.set(event.toolCallId, sentinel);
    return { block: true, reason: sentinel };
  });
  pi.on("message_end", (event) => {
    if (event.message.role !== "toolResult") return;
    const sentinel = blocked.get(event.message.toolCallId);
    if (!sentinel || event.message.toolName !== "TaskStop" ||
        event.message.content[0]?.type !== "text" ||
        event.message.content[0].text !== sentinel) return;
    blocked.delete(event.message.toolCallId);
    return { message: {
      ...event.message, isError: false,
      content: [{ type: "text", text: "Qualified stop correlated through real Pi message_end" }],
    } };
  });
}
