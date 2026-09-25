import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
export { estimateSavedSessionContext } from "../workflow-provider/context-estimate.ts";
export type { SavedContextEstimate } from "../workflow-provider/context-estimate.ts";
import {
	type ContextEstimateRecord,
	type LaunchProfile,
	profilePathForSession,
	updateLaunchProfile,
} from "./launch-profile.ts";

/** Saved sessions at or above this fraction of the selected context window
 * require an explicit resume/rollover decision. Resume-only: running children
 * are never interrupted at this threshold and active-session compaction stays
 * with Pi. */
export const RESUME_ROLLOVER_THRESHOLD = 0.65;

export interface ContextFit {
	contextTokens: number;
	contextWindow: number;
	ratio: number;
	requiresGate: boolean;
}

export type ResumeGateAction = "fresh" | "resume" | "choose" | "stop";

type GateContext = Pick<ExtensionContext, "hasUI" | "ui">;

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

export function buildRolloverHandoff(profile: LaunchProfile, userMessage?: string): string {
	return [
		"This is a fresh same-role rollover. Do not assume prior conversation history is present.",
		"Continue the same role from the latest durable project state.",
		...(profile.workflow
			? [
				"The manifest workflow runtime owns role-specific handoff data; use its dedicated lifecycle tool for workflow rollovers.",
			]
			: []),
		...(userMessage ? ["", "Latest user instruction:", userMessage] : []),
	].join("\n");
}
