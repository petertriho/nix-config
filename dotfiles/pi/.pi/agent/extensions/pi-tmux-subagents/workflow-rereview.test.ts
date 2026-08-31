import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	buildReReviewLaunch,
	chooseReReviewAction,
	RE_REVIEW_FRESH_LABEL,
	RE_REVIEW_LABELS,
	RE_REVIEW_RESUME_LABEL,
	RE_REVIEW_STOP_LABEL,
} from "./workflow-rereview.ts";

const WORKFLOW_SKILL_PATH = fileURLToPath(new URL("workflow-skill.md", import.meta.url));

function chooserContext(selection: string | undefined, seen: string[][] = []) {
	return {
		hasUI: true,
		ui: {
			select: async (_title: string, choices: string[]) => {
				seen.push(choices);
				return selection;
			},
		},
	} as any;
}

const CONTEXT = {
	planPath: "/tmp/project/.artifacts/demo/PLAN.md",
	tasksPath: "/tmp/project/.artifacts/demo/TASKS.md",
	baseRef: "abc123",
	reviewPath: "/tmp/project/.artifacts/demo/REVIEW.md",
	fixSummary: "Fixed 2 CRITICAL findings; npm test green.",
};

test("re-review gate offers exactly the three documented choices", async () => {
	const seen: string[][] = [];
	const ctx = chooserContext(RE_REVIEW_RESUME_LABEL, seen);
	await chooseReReviewAction(ctx);
	assert.equal(seen.length, 1);
	assert.deepEqual(seen[0], [
		RE_REVIEW_RESUME_LABEL,
		RE_REVIEW_FRESH_LABEL,
		RE_REVIEW_STOP_LABEL,
	]);
	assert.deepEqual(RE_REVIEW_LABELS, [
		"Resume the previous reviewer",
		"Start a fresh reviewer",
		"Stop without re-review",
	]);
});

test("re-review gate maps every choice and treats cancellation as undefined", async () => {
	for (const [label, expected] of [
		[RE_REVIEW_RESUME_LABEL, "resume"],
		[RE_REVIEW_FRESH_LABEL, "fresh"],
		[RE_REVIEW_STOP_LABEL, "stop"],
		[undefined, undefined],
	] as const) {
		assert.equal(
			await chooseReReviewAction(chooserContext(label)),
			expected,
			`label ${label} must map to ${expected}`,
		);
	}
});

test("the resume path builds a message that keeps the previous review optional", () => {
	const launch = buildReReviewLaunch("resume", CONTEXT);
	assert.equal(launch.choice, "resume");
	if (launch.choice !== "resume") return;
	assert.match(launch.message, /fix pass for the CRITICAL and HIGH findings/);
	assert.match(launch.message, /same reviewer/);
	assert.ok(launch.message.includes(`Base ref: ${CONTEXT.baseRef}`));
	assert.ok(launch.message.includes(`PLAN.md: ${CONTEXT.planPath}`));
	assert.ok(launch.message.includes(`TASKS.md: ${CONTEXT.tasksPath}`));
	assert.ok(launch.message.includes(`Previous REVIEW.md (optional input): ${CONTEXT.reviewPath}`));
	assert.ok(launch.message.includes(`Write the re-review to ${CONTEXT.reviewPath}`));
	assert.ok(launch.message.includes(CONTEXT.fixSummary!));
	assert.match(launch.message, /REVIEW: <absolute path>/);
});

test("the fresh path builds an independent reviewer task with full context", () => {
	const launch = buildReReviewLaunch("fresh", CONTEXT);
	assert.equal(launch.choice, "fresh");
	if (launch.choice !== "fresh") return;
	assert.match(launch.task, /execution-review skill/);
	assert.match(launch.task, /independently/);
	assert.ok(launch.task.includes(`Base ref: ${CONTEXT.baseRef}`));
	assert.ok(launch.task.includes(`PLAN.md: ${CONTEXT.planPath}`));
	assert.ok(launch.task.includes(`TASKS.md: ${CONTEXT.tasksPath}`));
	assert.ok(launch.task.includes(`Previous REVIEW.md (optional input): ${CONTEXT.reviewPath}`));
	assert.ok(launch.task.includes(`Write the re-review to ${CONTEXT.reviewPath}`));
	assert.match(launch.task, /REVIEW: <absolute path>/);
});

test("both reviewer paths omit the review line when no previous REVIEW.md exists", () => {
	const { reviewPath, ...withoutReview } = CONTEXT;
	assert.equal(reviewPath, CONTEXT.reviewPath);
	for (const choice of ["resume", "fresh"] as const) {
		const launch = buildReReviewLaunch(choice, withoutReview);
		if (launch.choice === "stop") assert.fail("expected a launch");
		const text = launch.choice === "resume" ? launch.message : launch.task;
		assert.ok(!text.includes("Previous REVIEW.md"));
		assert.ok(text.includes("Write the re-review to <same directory>/REVIEW.md"));
	}
});

test("stop and cancellation launch nothing", () => {
	assert.deepEqual(buildReReviewLaunch("stop", CONTEXT), { choice: "stop" });
	assert.deepEqual(buildReReviewLaunch(undefined, CONTEXT), { choice: "stop" });
});

test("a reviewer path without required plan, tasks, or base ref is rejected", () => {
	for (const omit of ["planPath", "tasksPath", "baseRef"] as const) {
		const broken = { ...CONTEXT };
		delete (broken as Record<string, unknown>)[omit];
		assert.throws(
			() => buildReReviewLaunch("fresh", broken),
			/A re-review needs the/,
			`missing ${omit} must throw`,
		);
	}
});

test("the workflow prompt documents the explicit re-review gate", () => {
	const prompt = readFileSync(WORKFLOW_SKILL_PATH, "utf8");
	// The gate exists with all three exact choices and no automatic re-review.
	assert.match(prompt, /## Gate 4: Re-review choice/);
	for (const label of RE_REVIEW_LABELS) {
		assert.ok(prompt.includes(`\`${label}\``), `workflow prompt must offer ${label}`);
	}
	assert.match(prompt, /Never re-review automatically/);
	assert.ok(!prompt.includes("Re-review only if the user asks"));

	// Stored-model resume: subagent_resume on the reviewer session, no model.
	const gate4 = prompt.slice(prompt.indexOf("## Gate 4"));
	const resumeSnippet = gate4.match(/subagent_resume\(\{[\s\S]*?\}\)/);
	assert.ok(resumeSnippet, "the resume choice must show a subagent_resume call");
	assert.ok(resumeSnippet[0].includes('sessionPath: "<reviewer session path>"'));
	assert.ok(!/\bmodel\b/.test(resumeSnippet[0]), "resume must not override the saved model");
	assert.ok(prompt.includes("no `model` override"));
	assert.match(prompt, /primary-skill\s*$/m);
	assert.match(prompt, /65% context-fit\/rollover gate apply unchanged/);

	// Fresh review: subagent with the reviewer agent and no model, resolved
	// by the active workflow policy.
	const freshSnippet = gate4.match(/\bsubagent\(\{[\s\S]*?\}\)/);
	assert.ok(freshSnippet, "the fresh choice must show a subagent call");
	assert.ok(freshSnippet[0].includes('name: "\u{F002} Reviewer"'));
	assert.ok(!/\bmodel\b/.test(freshSnippet[0]), "fresh review must not pin a model");
	assert.match(prompt, /no `model` argument/);
	assert.match(prompt, /active workflow policy resolves the reviewer's current workflow default/);

	// A rollover replacement updates the workflow-held reviewer path.
	assert.match(prompt, /replacementSessionPath`, replace the workflow-held reviewer/);

	// Stop (and cancel) launch no reviewer at all.
	assert.match(prompt, /\*\*Stop without re-review\*\*, and a cancelled choice, launch no reviewer/);
});
