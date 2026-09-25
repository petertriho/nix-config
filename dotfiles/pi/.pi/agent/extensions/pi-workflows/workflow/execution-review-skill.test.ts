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
		/user gives a path to `PLAN\.md` or `TASKS\.md` and the file is missing\s+or unreadable, stop with Nothing Reviewed/,
	);
	assert.match(inputs, /Never use a different path/);
});

test("execution review limits discovery to omitted inputs and keeps a supplied input's sibling scope", () => {
	assert.match(
		inputs,
		/user gives only one of the two files, use the other file from the\s+same directory/,
	);
	assert.match(
		inputs,
		/that file is missing or unreadable, stop with Nothing\s+Reviewed/,
	);
	assert.match(inputs, /Do not search other directories/);
	assert.match(
		inputs,
		/user gives neither file, sort the directories in `\.artifacts\/` at the\s+repository root by modification time/,
	);
	assert.match(inputs, /newest directory in which\s+both files are readable/);
	assert.match(inputs, /In the review, state which directory you\s+selected/);
});

test("execution review reports input failure without inventing an artifact destination", () => {
	assert.match(
		inputs,
		/If the user gave a review target, write the report there/,
	);
	assert.match(inputs, /no review target and a readable `PLAN\.md` is resolved,\s+write the report to `REVIEW\.md` next to that `PLAN\.md`/);
	assert.match(inputs, /Otherwise, do not create a file\. Give the report in the final response/);
	assert.match(
		format,
		/If the review target is known, write exactly one file to it/,
	);
	assert.match(format, /If it is not\s+known, do not create a file\. Give the Nothing Reviewed report in the final\s+response/);
	assert.match(format, /Verdict: NOTHING REVIEWED/);
});

test("execution review hands approved fixes to the installed execute skill without relaxing write boundaries", () => {
	assert.match(boundaries, /Write only `REVIEW\.md`/);
	assert.match(boundaries, /Do not stage or commit/);
	assert.match(
		boundaries,
		/Wait\s+for approval before you start `execute` as a separate workflow/,
	);
	assert.doesNotMatch(boundaries, /`implement`/);
	const execute = readFileSync(new URL("../execute/SKILL.md", SKILL_ROOT), "utf8");
	assert.match(execute, /^name: execute$/m);
});

test("execution review retains its verdict threshold and historical-evidence rules", () => {
	assert.match(skill, /historical evidence is missing or insufficient, record the line\s+as `unverified`/);
	assert.match(skill, /Do not infer a past RED run from a checkbox or from tests that pass now/);
	assert.match(skill, /Assess the corrective tasks and all current acceptance normally/);
	assert.match(skill, /verdict is `NEEDS CHANGES` if one or more of these conditions is true/);
	assert.match(skill, /A CRITICAL or HIGH finding exists/);
	assert.match(skill, /A checked task has a current acceptance line that is `not met`/);
	assert.match(skill, /The diff implements a non-goal/);
	assert.match(skill, /The diff reverses a settled decision/);
	assert.match(skill, /Otherwise, the verdict is `APPROVED`/);
});
