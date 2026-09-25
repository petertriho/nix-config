import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { calculateContextTokens, estimateTokens, SessionManager } from "@earendil-works/pi-coding-agent";

export interface SavedContextEstimate {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	source: "usage+estimate" | "conservative";
}

/** Estimate a saved Pi session without leaving migration writes behind. */
export function estimateSavedSessionContext(sessionPath: string): SavedContextEstimate {
	const before = readFileSync(sessionPath, "utf8");
	try {
		const messages = SessionManager.open(sessionPath).buildSessionContext().messages;
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
	} finally {
		if (existsSync(sessionPath) && readFileSync(sessionPath, "utf8") !== before) {
			writeFileSync(sessionPath, before, "utf8");
		}
	}
}
