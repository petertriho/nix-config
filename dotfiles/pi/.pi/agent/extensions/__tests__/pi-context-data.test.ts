import assert from "node:assert/strict";
import test from "node:test";
import {
	createSyntheticSourceInfo, formatSkillsForPrompt, SessionManager,
	type BuildSystemPromptOptions,
} from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import { createContextSnapshot, type SnapshotInput } from "../pi-context.ts";

const skill: NonNullable<BuildSystemPromptOptions["skills"]>[number] = {
	name: "escaped-skill",
	description: `It's "quoted" & <tag> > done`,
	filePath: "/skills/escaped-skill/SKILL.md",
	baseDir: "/skills/escaped-skill",
	sourceInfo: createSyntheticSourceInfo("/skills/escaped-skill/SKILL.md", {
		source: "test", baseDir: "/skills/escaped-skill",
	}),
	disableModelInvocation: false,
};

function skillRows(prompt: string, skills: NonNullable<BuildSystemPromptOptions["skills"]>) {
	const session = SessionManager.inMemory();
	return createContextSnapshot({
		prompt, options: { cwd: "/", skills }, activeTools: [], allTools: [],
		projection: session.buildSessionProjection(), branch: session.getBranch(),
		model: undefined, usage: undefined,
	}).rows.filter((row) => row.group === "Skills");
}

test("skill inventory follows Pi's escaped XML blocks in formatter and system prompt", () => {
	const disabled = { ...skill, name: "disabled", disableModelInvocation: true };
	const other = { ...skill, name: "other-skill", filePath: "/skills/other/SKILL.md" };
	const formatted = formatSkillsForPrompt([skill, disabled]);
	assert.match(formatted, /It&apos;s &quot;quoted&quot; &amp; &lt;tag&gt; &gt; done/);
	assert.doesNotMatch(formatted, /<name>disabled<\/name>/);
	assert.deepEqual(skillRows(formatted, [skill, disabled, other]).map((row) => row.label),
		["Skill index: escaped-skill (within prompt)"]);
	const options = { cwd: "/", selectedTools: ["read"], skills: [skill, disabled] };
	const rendered = buildSystemPrompt(options);
	assert.match(rendered, /<available_skills>/);
	assert.deepEqual(skillRows(rendered, options.skills).map((row) => row.label),
		["Skill index: escaped-skill (within prompt)"]);
});

test("unrelated name/description fragments and absent or altered blocks cannot attribute a skill", () => {
	const options = { cwd: "/", selectedTools: ["read"], skills: [skill] };
	const prose = `Read ${skill.name} at ${skill.filePath}: ${skill.description}`;
	assert.equal(skillRows(prose, [skill]).length, 0);
	const forced = buildSystemPrompt({ ...options, forceSystemPrompt: prose });
	assert.equal(skillRows(forced, options.skills).length, 0);
	const forcedWithBlock = buildSystemPrompt({ ...options,
		forceSystemPrompt: `Custom instructions\n${formatSkillsForPrompt(options.skills)}` });
	assert.equal(skillRows(forcedWithBlock, options.skills).length, 1);
	const noReadTool = buildSystemPrompt({ ...options, selectedTools: ["edit"],
		appendSystemPrompt: prose });
	assert.equal(skillRows(noReadTool, options.skills).length, 0);
	const changedLocation = formatSkillsForPrompt([{ ...skill, filePath: "/elsewhere/SKILL.md" }]);
	assert.equal(skillRows(changedLocation, [skill]).length, 0);
	assert.equal(skillRows(formatSkillsForPrompt([skill]).replace("<available_skills>", "<quoted_skills>"), [skill]).length, 0);
});

function assistant(model: string, totalTokens: number, input: number, stopReason: "stop" | "aborted" | "error" = "stop",
	withUsage = true) {
	return {
		role: "assistant" as const, content: [{ type: "text" as const, text: "answer" }],
		api: "test" as const, provider: "p", model, stopReason, timestamp: 1,
		usage: withUsage ? { input, output: input === 0 ? 0 : 1, cacheRead: 0, cacheWrite: 0, totalTokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } : undefined!,
	};
}

function usageSnapshot(session: SessionManager, model = "model-a", tokens = 701): SnapshotInput {
	return {
		prompt: "prompt", options: { cwd: "/" }, activeTools: [], allTools: [],
		projection: session.buildSessionProjection(), branch: session.getBranch(),
		model: { provider: "p", id: model, contextWindow: 1000 },
		usage: { tokens, contextWindow: 1000, percent: tokens / 10 },
	};
}

test("component-only usage is attributable to the current model", () => {
	const session = SessionManager.inMemory();
	session.appendMessage(assistant("model-a", 0, 700));
	const snapshot = createContextSnapshot(usageSnapshot(session));
	assert.equal(snapshot.usage.tokens, 701);
	assert.equal(snapshot.usage.percent, 70.1);
	assert.match(snapshot.usage.provenance, /last accounted request/);
});

test("the last component-only assistant wins over an older totalTokens source", () => {
	const session = SessionManager.inMemory();
	session.appendMessage(assistant("model-a", 11, 10));
	session.appendMessage(assistant("model-b", 0, 700));
	const snapshot = createContextSnapshot(usageSnapshot(session));
	assert.equal(snapshot.usage.tokens, null);
	assert.equal(snapshot.usage.percent, null);
	assert.match(snapshot.usage.provenance, /Unknown/);
	assert.equal(createContextSnapshot(usageSnapshot(session, "model-b")).usage.tokens, 701);
});

test("aborted, errored, zero and absent usage do not become attribution sources", () => {
	for (const { stopReason, withUsage, input } of [
		{ stopReason: "aborted", withUsage: true, input: 700 },
		{ stopReason: "error", withUsage: true, input: 700 },
		{ stopReason: "stop", withUsage: true, input: 0 },
		{ stopReason: "stop", withUsage: false, input: 700 },
	] as const) {
		const session = SessionManager.inMemory();
		session.appendMessage(assistant("model-a", 11, 10));
		session.appendMessage(assistant("model-b", 0, input, stopReason, withUsage));
		assert.equal(createContextSnapshot(usageSnapshot(session, "model-a", 11)).usage.tokens, 11, stopReason);
		assert.equal(createContextSnapshot(usageSnapshot(session, "model-b")).usage.tokens, null, stopReason);
	}
	const session = SessionManager.inMemory();
	session.appendMessage(assistant("model-a", 0, 700, "error"));
	assert.equal(createContextSnapshot(usageSnapshot(session)).usage.percent, null);
	session.appendMessage(assistant("model-a", 0, 700, "stop", false));
	assert.equal(createContextSnapshot(usageSnapshot(session)).usage.percent, null);
});
