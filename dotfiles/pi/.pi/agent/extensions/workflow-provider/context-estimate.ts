import { readFileSync } from "node:fs";
import { calculateContextTokens, estimateTokens, parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";

export interface SavedContextEstimate {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	source: "usage+estimate" | "conservative";
}

/** Estimate an immutable snapshot without writing to the live session. */
export function estimateSavedSessionContext(sessionPath: string): SavedContextEstimate {
	const snapshot = readFileSync(sessionPath, "utf8");
	const entries = parseSessionEntries(snapshot).filter(Boolean);
	const header = entries[0];
	// Match file-backed loading: empty files are allowed, but nonempty files
	// must start with a valid session header after skipping malformed lines.
	if (snapshot.length > 0 && (header?.type !== "session" || typeof header.id !== "string")) {
		throw new Error(`Session file is not a valid pi session: ${sessionPath}`);
	}
	// inMemory migrates legacy entries and reconstructs the active branch
	// without repairing or rewriting a file that a child may still be appending.
	const messages = SessionManager.inMemory(undefined, undefined, entries).buildSessionContext().messages;
	let lastUsageIndex = -1;
	let usageTokens = 0;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const candidate = messages[index];
		if (candidate?.role !== "assistant" || !candidate.usage) continue;
		try {
			const tokens = calculateContextTokens(candidate.usage);
			if (tokens === 0 && (candidate.stopReason === "error" || candidate.stopReason === "aborted")) continue;
			usageTokens = tokens;
			lastUsageIndex = index;
			break;
		} catch {
			// Incomplete usage falls back to an estimate over every message.
		}
	}
	if (lastUsageIndex >= 0) {
		const trailingTokens = messages.slice(lastUsageIndex + 1).reduce((sum, message) => sum + estimateTokens(message), 0);
		return { tokens: Math.max(0, usageTokens + trailingTokens), usageTokens, trailingTokens, source: "usage+estimate" };
	}
	const tokens = messages.reduce((sum, message) => sum + estimateTokens(message), 0);
	return { tokens, usageTokens: 0, trailingTokens: tokens, source: "conservative" };
}
