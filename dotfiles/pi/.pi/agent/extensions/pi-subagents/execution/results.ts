import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatUsageSummary, withContextWindow, type SubagentUsageSummary } from "../telemetry/usage.ts";
import type { LaunchContext, SubagentResult } from "./types.ts";

const CLAUDE_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions", "claude-code");

export function formatElapsed(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function getShellReadyDelayMs(): number {
	const raw = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS?.trim();
	const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
}

export function resolveUsageContextWindow(
	usage: SubagentUsageSummary,
	registry: LaunchContext["modelRegistry"],
): number | undefined {
	if (!usage.provider || !usage.model || !registry) return undefined;
	const model = registry
		.getAvailable()
		.find((candidate) => candidate.provider === usage.provider && candidate.id === usage.model);
	return model && model.contextWindow > 0 ? model.contextWindow : undefined;
}

export function resolveUsageDetails(
	result: Pick<SubagentResult, "usage">,
	ctx: LaunchContext,
): SubagentUsageSummary | undefined {
	if (!result.usage) return undefined;
	return withContextWindow(result.usage, resolveUsageContextWindow(result.usage, ctx.modelRegistry));
}

export function resolveResultPresentation(
	result: Pick<
		SubagentResult,
		"exitCode" | "elapsed" | "summary" | "sessionFile" | "errorMessage" | "usage"
	>,
	name: string,
): string {
	const sessionRef = result.sessionFile
		? `\n\nSession: ${result.sessionFile}\nResume: pi --session ${result.sessionFile}`
		: "";
	const usageBlock = formatUsageSummary(result.usage);
	const usageRef = usageBlock ? `\n\n${usageBlock}` : "";

	if (result.errorMessage) {
		return (
			`Sub-agent "${name}" failed after ${formatElapsed(result.elapsed)} `
			+ `(provider/agent error — auto-retry exhausted).\n\n`
			+ `Error: ${result.errorMessage}\n\n`
			+ "The agent did not produce a result. Start a new "
			+ `Agent call or resume with Agent using its saved session path.${usageRef}${sessionRef}`
		);
	}

	return result.exitCode === 0
		? `Sub-agent "${name}" completed (${formatElapsed(result.elapsed)}).\n\n${result.summary}${usageRef}${sessionRef}`
		: `Sub-agent "${name}" failed (exit code ${result.exitCode}).\n\n${result.summary}${usageRef}${sessionRef}`;
}

export function sendSubagentPing(
	pi: ExtensionAPI,
	result: SubagentResult,
	agent: string | undefined,
	sessionPath: string | undefined,
): void {
	if (!result.ping) return;
	const sessionRef = sessionPath ? `\n\nSession: ${sessionPath}\nResume: pi --session ${sessionPath}` : "";
	pi.sendMessage(
		{
			customType: "subagent_ping",
			content: `Sub-agent "${result.ping.name}" needs help (${formatElapsed(result.elapsed)}):\n\n${result.ping.message}${sessionRef}`,
			display: true,
			details: {
				name: result.ping.name,
				message: result.ping.message,
				agent,
				sessionFile: sessionPath,
			},
		},
		{ triggerTurn: true, deliverAs: "steer" },
	);
}

export function copyClaudeSession(sentinelFile: string): string | null {
	try {
		const transcriptFile = sentinelFile + ".transcript";
		if (!existsSync(transcriptFile)) return null;
		const transcriptPath = readFileSync(transcriptFile, "utf-8").trim();
		if (!transcriptPath || !existsSync(transcriptPath)) return null;
		mkdirSync(CLAUDE_SESSIONS_DIR, { recursive: true });
		const filename = transcriptPath.split("/").pop() ?? `claude-${Date.now()}.jsonl`;
		const dest = join(CLAUDE_SESSIONS_DIR, filename);
		copyFileSync(transcriptPath, dest);
		return filename.endsWith(".jsonl") ? filename.slice(0, -".jsonl".length) : filename;
	} catch {
		return null;
	}
}

export function fallbackSummary(result: { exitCode: number; errorMessage?: string }): string {
	if (result.errorMessage) return `Subagent error: ${result.errorMessage}`;
	return result.exitCode === 0
		? "Sub-agent exited without output"
		: `Sub-agent exited with code ${result.exitCode}`;
}
