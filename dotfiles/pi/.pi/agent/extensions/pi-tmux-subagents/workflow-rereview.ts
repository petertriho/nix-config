import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Explicit re-review selection (T8).
 *
 * After every approved fix pass the workflow asks the user how to re-review
 * the fixed implementation instead of re-reviewing automatically: resume the
 * previous reviewer, start a fresh reviewer, or stop without re-review.
 *
 * This module is the shared definition behind that gate: the typed choice
 * union with the exact user-facing labels (workflow-skill.md documents the
 * same three choices), an interactive chooser, and the task/prompt builder
 * for the chosen reviewer path. The previous `REVIEW.md` is always offered
 * as optional input and never rewritten by this module; the review artifact
 * format is unchanged.
 */

export type ReReviewChoice = "resume" | "fresh" | "stop";

/** Gate labels. These exact strings are the workflow's user-facing choices. */
export const RE_REVIEW_RESUME_LABEL = "Resume the previous reviewer";
export const RE_REVIEW_FRESH_LABEL = "Start a fresh reviewer";
export const RE_REVIEW_STOP_LABEL = "Stop without re-review";

export const RE_REVIEW_LABELS: readonly string[] = [
	RE_REVIEW_RESUME_LABEL,
	RE_REVIEW_FRESH_LABEL,
	RE_REVIEW_STOP_LABEL,
];

type GateContext = Pick<ExtensionContext, "hasUI" | "ui">;

/**
 * Ask the re-review gate. Returns the typed choice, or `undefined` when the
 * user cancels the chooser. Cancellation means no reviewer is launched, the
 * same as `stop`.
 */
export async function chooseReReviewAction(
	ctx: GateContext,
): Promise<ReReviewChoice | undefined> {
	const selected = await ctx.ui.select(
		"The fix pass is complete. Choose how to re-review the fixed implementation",
		[...RE_REVIEW_LABELS],
	);
	if (selected === RE_REVIEW_RESUME_LABEL) return "resume";
	if (selected === RE_REVIEW_FRESH_LABEL) return "fresh";
	if (selected === RE_REVIEW_STOP_LABEL) return "stop";
	return undefined;
}

export interface ReReviewContext {
	planPath: string;
	tasksPath: string;
	baseRef: string;
	/**
	 * Previous `REVIEW.md`: optional input for the next review and the path
	 * the re-review writes to. Omitted when no review exists yet.
	 */
	reviewPath?: string;
	/** What the approved fix pass changed, taken from the fix result. */
	fixSummary?: string;
}

export type ReReviewLaunch =
	| { choice: "resume"; message: string }
	| { choice: "fresh"; task: string }
	| { choice: "stop" };

/**
 * Build the launch payload for the chosen reviewer path. `fresh` yields the
 * task for `subagent` with `agent: "reviewer"`; `resume` yields the message
 * for `subagent_resume` on the stored reviewer session. Both carry the base
 * ref and PLAN/TASK paths, keep the previous `REVIEW.md` as optional input,
 * and leave model selection alone (saved-session selection on resume, active
 * workflow policy for a fresh reviewer). `stop` and cancellation yield no
 * launch at all.
 */
export function buildReReviewLaunch(
	choice: ReReviewChoice | undefined,
	context: ReReviewContext,
): ReReviewLaunch {
	if (choice !== "resume" && choice !== "fresh") {
		return { choice: "stop" };
	}

	const required: Array<[keyof ReReviewContext, string]> = [
		["planPath", "PLAN.md path"],
		["tasksPath", "TASKS.md path"],
		["baseRef", "base ref"],
	];
	for (const [field, label] of required) {
		if (!context[field]) throw new Error(`A re-review needs the ${label}.`);
	}

	const reviewPath = context.reviewPath ?? "<same directory>/REVIEW.md";
	const shared = [
		`Base ref: ${context.baseRef}.`,
		`PLAN.md: ${context.planPath}.`,
		`TASKS.md: ${context.tasksPath}.`,
		...(context.reviewPath
			? [`Previous REVIEW.md (optional input): ${context.reviewPath}.`]
			: []),
		...(context.fixSummary ? [`Fix pass summary: ${context.fixSummary}`] : []),
		`Write the re-review to ${reviewPath} and edit nothing else.`,
		"Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`.",
	];

	if (choice === "resume") {
		return {
			choice: "resume",
			message: [
				"The user approved a fix pass for the CRITICAL and HIGH findings, and it is complete.",
				"Re-review the fixed implementation now, as the same reviewer.",
				...shared,
			].join("\n"),
		};
	}

	return {
		choice: "fresh",
		task: [
			"Re-review the implementation with the implementation-review skill after an approved fix pass.",
			"Judge the fixed implementation independently; use the previous review, if any, only as optional context.",
			...shared,
		].join("\n"),
	};
}
