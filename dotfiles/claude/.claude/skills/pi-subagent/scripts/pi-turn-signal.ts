/**
 * Child-side extension for the `pi-subagent` wrapper, loaded with `-e`.
 * Appends one JSON line per settled pi run to `PI_SUBAGENT_TURNS_FILE`.
 * Only type imports from pi: this file lives outside pi's extensions directory.
 */
import { appendFileSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface TurnResult {
	text: string;
	stopReason: string;
	errorMessage?: string;
}

/** Text blocks of the last assistant message, with its stop reason. */
export function extractAssistantText(messages: readonly any[] | undefined): TurnResult {
	for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
		const msg = messages![i];
		if (msg?.role !== "assistant") continue;
		const blocks = Array.isArray(msg.content) ? msg.content : [];
		const text = blocks
			.filter((block: any) => block?.type === "text" && typeof block.text === "string")
			.map((block: any) => block.text)
			.join("\n");
		const result: TurnResult = { text, stopReason: String(msg.stopReason ?? "none") };
		if (typeof msg.errorMessage === "string" && msg.errorMessage.trim() !== "") {
			result.errorMessage = msg.errorMessage.trim();
		}
		return result;
	}
	return { text: "", stopReason: "none" };
}

function nextSeq(file: string): number {
	let content = "";
	try {
		content = readFileSync(file, "utf8");
	} catch {
		// A missing file starts the sequence at 1.
	}
	return content.split("\n").filter((line) => line.trim() !== "").length + 1;
}

export default function piTurnSignal(pi: ExtensionAPI) {
	const turnsFile = process.env.PI_SUBAGENT_TURNS_FILE;
	if (!turnsFile) return;

	let pending: TurnResult | undefined;

	// agent_end can fire more than once per run (retries, compaction recovery),
	// so keep the latest result and write it only when the run has settled.
	pi.on("agent_end", (event) => {
		pending = extractAssistantText((event as any).messages);
	});

	pi.on("agent_settled", () => {
		if (!pending) return;
		const result = pending;
		pending = undefined;
		try {
			const record = { seq: nextSeq(turnsFile), at: new Date().toISOString(), ...result };
			appendFileSync(turnsFile, JSON.stringify(record) + "\n");
		} catch {
			// Never throw into pi. The waiting wrapper reports the dead pane or times out.
		}
	});
}
