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
	const session = SessionManager.inMemory(undefined, undefined, entries);
	const projection = session.buildSessionProjection();
	const { messages } = projection;
	const branch = session.getBranch();
	let lastContextChange = -1;
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		if (branch[index].type === "compaction" || branch[index].type === "context_edit") {
			lastContextChange = index;
			break;
		}
	}
	// Usage describes the request before an edit or compaction, even when the
	// assistant response survives in the reconstructed context.
	const applicableEntryIds = new Set(branch.slice(lastContextChange + 1).map((entry) => entry.id));
	const applicableMessages = new Set(projection.entries
		.filter((entry) => applicableEntryIds.has(entry.sourceEntry.id))
		.flatMap((entry) => entry.messages));
	let lastUsageIndex = -1;
	let usageTokens = 0;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const candidate = messages[index];
		if (candidate?.role !== "assistant" || !candidate.usage || !applicableMessages.has(candidate)) continue;
		if (candidate.stopReason === "error" || candidate.stopReason === "aborted") continue;
		try {
			const values = [candidate.usage.totalTokens, candidate.usage.input, candidate.usage.output,
				candidate.usage.cacheRead, candidate.usage.cacheWrite];
			if (values.some((value) => value !== undefined
				&& (typeof value !== "number" || !Number.isFinite(value) || value < 0))) continue;
			const tokens = calculateContextTokens(candidate.usage);
			if (!Number.isFinite(tokens) || tokens <= 0) continue;
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
