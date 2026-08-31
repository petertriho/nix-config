import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	calculateContextTokens,
	estimateTokens,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	type ContextEstimateRecord,
	type LaunchProfile,
	profilePathForSession,
	updateLaunchProfile,
	type WorkflowArtifacts,
	type WorkflowPhase,
} from "./launch-profile.ts";

/** Saved sessions at or above this fraction of the selected context window
 * require an explicit resume/rollover decision. Resume-only: running children
 * are never interrupted at this threshold and active-session compaction stays
 * with Pi. */
export const RESUME_ROLLOVER_THRESHOLD = 0.65;

export interface SavedContextEstimate {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	source: "usage+estimate" | "conservative";
}

export interface ContextFit {
	contextTokens: number;
	contextWindow: number;
	ratio: number;
	requiresGate: boolean;
}

export type ResumeGateAction = "fresh" | "resume" | "choose" | "stop";

type GateContext = Pick<ExtensionContext, "hasUI" | "ui">;

type AssistantUsage = Parameters<typeof calculateContextTokens>[0];

interface AssistantUsageCandidate {
	usage: AssistantUsage;
	stopReason?: string;
}

function assistantUsage(message: unknown): AssistantUsageCandidate | undefined {
	if (!message || typeof message !== "object") return undefined;
	const candidate = message as { role?: unknown; usage?: unknown; stopReason?: unknown };
	if (candidate.role !== "assistant" || !candidate.usage) return undefined;
	return {
		usage: candidate.usage as AssistantUsage,
		...(typeof candidate.stopReason === "string"
			? { stopReason: candidate.stopReason }
			: {}),
	};
}

/**
 * Estimate the saved session's active context without mutating the file.
 *
 * Opens the session read-only through Pi's session utilities. Pi may rewrite
 * the file while opening (empty-file initialization or version migration), so
 * the original bytes are snapshotted first and restored if Pi touched them.
 * Prefers the latest completed assistant usage plus an estimate of trailing
 * messages; falls back to a conservative estimate over every message when no
 * usage exists.
 */
export function estimateSavedSessionContext(sessionPath: string): SavedContextEstimate {
	const before = readFileSync(sessionPath, "utf8");
	try {
		return estimateFromManager(SessionManager.open(sessionPath));
	} finally {
		if (existsSync(sessionPath) && readFileSync(sessionPath, "utf8") !== before) {
			// Pi only rewrites on initialization or migration; estimation must not.
			writeFileSync(sessionPath, before, "utf8");
		}
	}
}

function estimateFromManager(
	session: ReturnType<typeof SessionManager.open>,
): SavedContextEstimate {
	const messages = session.buildSessionContext().messages;

	let lastUsageIndex = -1;
	let usageTokens = 0;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const candidate = assistantUsage(messages[index]);
		if (!candidate) continue;
		try {
			const candidateTokens = calculateContextTokens(candidate.usage);
			if (
				candidateTokens === 0
				&& (candidate.stopReason === "error" || candidate.stopReason === "aborted")
			) {
				continue;
			}
			usageTokens = candidateTokens;
			lastUsageIndex = index;
			break;
		} catch {
			// Fall through to the conservative full-message estimate.
		}
	}

	if (lastUsageIndex >= 0) {
		const trailingTokens = messages
			.slice(lastUsageIndex + 1)
			.reduce((sum, message) => sum + estimateTokens(message), 0);
		return {
			tokens: Math.max(0, usageTokens + trailingTokens),
			usageTokens,
			trailingTokens,
			source: "usage+estimate",
		};
	}

	const tokens = messages.reduce((sum, message) => sum + estimateTokens(message), 0);
	return {
		tokens,
		usageTokens: 0,
		trailingTokens: tokens,
		source: "conservative",
	};
}

/** Persistable form of a context-fit decision for the launch profile. */
export function toContextEstimateRecord(fit: ContextFit): ContextEstimateRecord {
	return {
		tokens: fit.contextTokens,
		contextWindow: fit.contextWindow,
		ratio: fit.ratio,
		estimatedAt: new Date().toISOString(),
	};
}

/**
 * Link the old and new sidecars through rollover lineage: the replacement
 * records where it rolled over from, the replaced session records its
 * successor. Existing lineage entries are preserved. Returns one warning
 * string per sidecar that could not be updated; a failed write never undoes
 * the launch itself.
 */
export function linkRolloverLineage(rolledOverFrom: string, rolledOverTo: string): string[] {
	const warnings: string[] = [];
	const link = (sessionPath: string, apply: (next: LaunchProfile) => LaunchProfile) => {
		try {
			updateLaunchProfile(sessionPath, apply);
		} catch (error) {
			warnings.push(
				`Could not update ${profilePathForSession(sessionPath)}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};
	link(rolledOverTo, (next) => ({
		...next,
		lineage: { ...(next.lineage ?? {}), rolledOverFrom },
	}));
	link(rolledOverFrom, (next) => ({
		...next,
		lineage: { ...(next.lineage ?? {}), rolledOverTo },
	}));
	return warnings;
}

export function calculateContextFit(
	contextTokens: number,
	contextWindow: number,
	threshold = RESUME_ROLLOVER_THRESHOLD,
): ContextFit {
	if (!Number.isFinite(contextTokens) || contextTokens < 0) {
		throw new Error("contextTokens must be a finite non-negative number");
	}
	if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
		throw new Error("contextWindow must be a finite positive number");
	}
	const ratio = contextTokens / contextWindow;
	return {
		contextTokens,
		contextWindow,
		ratio,
		requiresGate: ratio >= threshold,
	};
}

export async function chooseResumeGateAction(
	ctx: GateContext,
	fit: ContextFit,
): Promise<ResumeGateAction> {
	if (!fit.requiresGate) return "resume";
	if (!ctx.hasUI) {
		throw new Error(
			`The saved session is at ${Math.round(fit.ratio * 100)}% of the selected model context. `
			+ "Interactive UI is required to choose fresh rollover, resume anyway, another model, or stop.",
		);
	}

	const fresh = "Start a fresh same-role session (recommended)";
	const resume = "Resume the saved session anyway";
	const choose = "Choose another model";
	const stop = "Stop";
	const selected = await ctx.ui.select(
		`Saved context: ${fit.contextTokens.toLocaleString()} / ${fit.contextWindow.toLocaleString()} tokens (${Math.round(fit.ratio * 100)}%)`,
		[fresh, resume, choose, stop],
	);
	if (selected === fresh) return "fresh";
	if (selected === resume) return "resume";
	if (selected === choose) return "choose";
	return "stop";
}

function artifactLines(phase: WorkflowPhase, artifacts: WorkflowArtifacts): string[] {
	const lines: string[] = [];
	const add = (label: string, path: string | undefined) => {
		if (path) lines.push(`- ${label}: ${path}`);
	};

	switch (phase) {
		case "planner":
			add("PLAN.md", artifacts.plan);
			break;
		case "task-writer":
			add("PLAN.md", artifacts.plan);
			add("TASKS.md", artifacts.tasks);
			break;
		case "executor":
			add("PLAN.md", artifacts.plan);
			add("TASKS.md", artifacts.tasks);
			add("Previous REVIEW.md (optional)", artifacts.review);
			add("Base ref", artifacts.baseRef);
			break;
		case "reviewer":
			add("PLAN.md", artifacts.plan);
			add("TASKS.md", artifacts.tasks);
			add("Previous REVIEW.md (optional)", artifacts.review);
			add("Base ref", artifacts.baseRef);
			break;
	}
	return lines;
}

export function buildRolloverHandoff(profile: LaunchProfile, userMessage?: string): string {
	const phase = profile.workflow?.phase;
	const artifacts = profile.workflow?.artifacts ?? {};
	const lines = phase ? artifactLines(phase, artifacts) : [];
	const roleInstruction = phase
		? {
			planner: "Continue planning from the current PLAN.md state and the user's latest adjustment.",
			"task-writer": "Re-read PLAN.md and TASKS.md, then continue task writing from the current artifacts.",
			executor: "Re-read the handoff artifacts and continue from the first unchecked task or named review finding.",
			reviewer: "Perform an independent review from the current artifacts and base ref. Use the previous review only as optional context.",
		}[phase]
		: "Continue the same role from the latest durable project artifacts.";

	return [
		"This is a fresh same-role rollover. Do not assume prior conversation history is present.",
		roleInstruction,
		...(lines.length > 0 ? ["", "Handoff artifacts:", ...lines] : []),
		...(userMessage ? ["", "Latest user instruction:", userMessage] : []),
	].join("\n");
}
