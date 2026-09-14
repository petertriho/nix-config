import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const SKILL_ROOT = new URL(
	"../../../../../../agents/.agents/skills/execution-review/",
	import.meta.url,
);
const skill = readFileSync(new URL("SKILL.md", SKILL_ROOT), "utf8");
const format = readFileSync(new URL("references/output-format.md", SKILL_ROOT), "utf8");
const inputs = skill.split("## Inputs\n")[1].split("## References\n")[0];
const boundaries = skill.split("## Boundaries\n")[1].split("## Workflow\n")[0];

test("execution review stops for invalid explicit inputs instead of substituting another plan", () => {
	assert.match(
		inputs,
		/explicitly supplied `PLAN\.md` or `TASKS\.md` path is missing or\s+unreadable, stop with "Nothing Reviewed"/,
	);
	assert.match(inputs, /Never substitute another path/);
});

test("execution review limits discovery to omitted inputs and keeps a supplied input's sibling scope", () => {
	assert.match(
		inputs,
		/only one input is omitted, use the sibling file next to the supplied\s+input/,
	);
	assert.match(
		inputs,
		/sibling is missing or unreadable, stop with "Nothing Reviewed"/,
	);
	assert.match(inputs, /Do not search another directory/);
	assert.match(
		inputs,
		/both inputs are omitted, list the repository root's `\.artifacts\/` directories\s+by modification time/,
	);
	assert.match(inputs, /newest directory containing both readable\s+files/);
	assert.match(inputs, /[Ss]tate the choice in the review/);
});

test("execution review reports input failure without inventing an artifact destination", () => {
	assert.match(
		inputs,
		/Write it only to an explicit `REVIEW\.md` target\s+or next to a valid resolved `PLAN\.md`/,
	);
	assert.match(inputs, /Otherwise, report it in the final\s+response without creating a file/);
	assert.match(
		format,
		/input failure with no explicit\s+target or valid resolved `PLAN\.md`/,
	);
	assert.match(format, /final response without creating a file/);
	assert.match(format, /Verdict: NOTHING REVIEWED/);
});

test("execution review hands approved fixes to the installed execute skill without relaxing write boundaries", () => {
	assert.match(boundaries, /Write only `REVIEW\.md`/);
	assert.match(boundaries, /Do not commit or stage/);
	assert.match(
		boundaries,
		/wait for approval before switching to `execute` as a separate workflow/,
	);
	assert.doesNotMatch(boundaries, /`implement`/);
	const execute = readFileSync(new URL("../execute/SKILL.md", SKILL_ROOT), "utf8");
	assert.match(execute, /^name: execute$/m);
});

test("execution review retains its verdict threshold and historical-evidence rules", () => {
	assert.match(skill, /Missing or insufficient historical evidence is `unverified`/);
	assert.match(skill, /Do not infer a past RED run from a checkbox or currently passing tests/);
	assert.match(skill, /Check corrective tasks and all unsuperseded acceptance normally/);
	assert.match(
		skill,
		/Verdict is `NEEDS CHANGES` when any CRITICAL or HIGH finding exists, any\s+current acceptance line is `not met` for a `\[x\]` task, a non-goal was\s+implemented, or a settled decision was reversed\. Otherwise `APPROVED`/,
	);
});
