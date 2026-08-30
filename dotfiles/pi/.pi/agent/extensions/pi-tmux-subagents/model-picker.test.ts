import assert from "node:assert/strict";
import test from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import {
	buildPickerModelItems,
	parseExplicitModelSelection,
	pickModelSelection,
	resolveConfiguredAgentModel,
	resolveModelPolicy,
} from "./model-picker.ts";
import type { LaunchProfile } from "./launch-profile.ts";

type AnyModel = Model<any>;

function model(
	provider: string,
	id: string,
	options: {
		name?: string;
		contextWindow?: number;
		reasoning?: boolean;
		thinkingLevelMap?: AnyModel["thinkingLevelMap"];
	} = {},
): AnyModel {
	return {
		provider,
		id,
		name: options.name ?? id,
		api: "openai-responses",
		baseUrl: "https://example.test",
		reasoning: options.reasoning ?? true,
		thinkingLevelMap: options.thinkingLevelMap,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: options.contextWindow ?? 128_000,
		maxTokens: 16_000,
	};
}

const scoped = model("anthropic", "claude", {
	name: "Claude",
	contextWindow: 200_000,
	thinkingLevelMap: { xhigh: "xhigh" },
});
const other = model("openai", "gpt", {
	name: "GPT",
	contextWindow: 100_000,
	thinkingLevelMap: { minimal: null, xhigh: null, max: null },
});
const plain = model("local", "plain", { reasoning: false, contextWindow: 32_000 });

function context(options: {
	hasUI?: boolean;
	selections?: Array<string | undefined | ((choices: string[]) => string | undefined)>;
	scopedModels?: Array<{ model: AnyModel; thinkingLevel?: any }>;
	available?: AnyModel[];
	current?: AnyModel;
	thinkingLevel?: any;
} = {}) {
	const selections = [...(options.selections ?? [])];
	const selectCalls: Array<{ title: string; choices: string[] }> = [];
	return {
		hasUI: options.hasUI ?? true,
		ui: {
			select: async (title: string, choices: string[]) => {
				selectCalls.push({ title, choices });
				const respond = selections.shift();
				return typeof respond === "function" ? respond(choices) : respond;
			},
		},
		scopedModels: options.scopedModels ?? [{ model: scoped, thinkingLevel: "high" }],
		modelRegistry: {
			getAvailable: () => options.available ?? [scoped, other, plain],
		},
		model: options.current ?? scoped,
		thinkingLevel: options.thinkingLevel ?? "high",
		selectCalls,
	} as any;
}

function profile(lastModel = { provider: "anthropic", model: "claude", thinking: "high" as const }) {
	return {
		runtime: { lastModel },
	} as LaunchProfile;
}

test("explicit model parsing accepts exact IDs and validates supported thinking", () => {
	assert.deepEqual(parseExplicitModelSelection("anthropic/claude:high", [scoped, other]), {
		model: scoped,
		thinking: "high",
	});
	assert.deepEqual(parseExplicitModelSelection("anthropic/claude", [scoped]), {
		model: scoped,
		thinking: undefined,
	});
	assert.throws(
		() => parseExplicitModelSelection("openai/gpt:minimal", [other]),
		/does not support thinking level/,
	);
	assert.throws(
		() => parseExplicitModelSelection("missing/model", [scoped]),
		/not authenticated and available/,
	);
});

test("picker model items show scoped models first and expand to all models", () => {
	const ctx = context();
	assert.deepEqual(
		buildPickerModelItems(ctx, false).map((item) => `${item.model.provider}/${item.model.id}`),
		["anthropic/claude"],
	);
	assert.deepEqual(
		buildPickerModelItems(ctx, true).map((item) => `${item.model.provider}/${item.model.id}`),
		["anthropic/claude", "local/plain", "openai/gpt"],
	);
});

test("picker expands all models, shows context pressure, and requires thinking", async () => {
	const ctx = context({
		selections: [
			"Show all authenticated models…",
			"openai/gpt · GPT · 100k · 70% context · rollover warning",
			"high",
		],
	});
	const picked = await pickModelSelection(ctx, { contextTokens: 70_000 });
	assert.equal(picked?.argument, "openai/gpt:high");
	assert.equal(picked?.source, "picker");
});

test("picker cancellation and non-interactive use are actionable", async () => {
	assert.equal(await pickModelSelection(context({ selections: [undefined] }), {}), undefined);
	await assert.rejects(
		() => pickModelSelection(context({ hasUI: false }), {}),
		/needs interactive UI/,
	);
});

test("picker dialogs carry the configured subject and mark the current model row", async () => {
	const ctx = context({
		scopedModels: [],
		selections: [
			(choices: string[]) => choices.find((label: string) => label.includes("· current")) ?? choices[0],
			"high",
		],
	});
	const picked = await pickModelSelection(ctx, {
		subject: "scout",
		currentRef: "anthropic/claude:high",
	});
	assert.equal(picked?.argument, "anthropic/claude:high");
	// Without an explicit title the generic model-list title stays.
	assert.equal(ctx.selectCalls[0].title, "Select subagent model");
	// Exactly the current row carries the marker; a :thinking-suffixed
	// currentRef still matches its bare provider/model row.
	const modelChoices = ctx.selectCalls[0].choices;
	assert.equal(modelChoices.filter((label: string) => label.includes("· current")).length, 1);
	assert.ok(modelChoices.find((label: string) => label.startsWith("anthropic/claude"))?.includes("· current"));
	assert.ok(!modelChoices.find((label: string) => label.startsWith("openai/gpt"))?.includes("· current"));
	assert.ok(!modelChoices.find((label: string) => label.startsWith("local/plain"))?.includes("· current"));
	// The thinking prompt names the subject and the canonical model.
	assert.equal(ctx.selectCalls[1].title, "Thinking for scout — anthropic/claude");
});

test("picker without subject and currentRef keeps the legacy dialog titles", async () => {
	const ctx = context({
		scopedModels: [],
		available: [plain],
		selections: ["local/plain · 32k", "off"],
	});
	const picked = await pickModelSelection(ctx, {});
	assert.equal(picked?.argument, "local/plain:off");
	assert.equal(ctx.selectCalls[0].title, "Select subagent model");
	assert.ok(!ctx.selectCalls[0].choices.some((label: string) => label.includes("· current")));
	assert.equal(ctx.selectCalls[1].title, "Thinking level for local/plain");
});

test("resolveModelPolicy forwards the picker prompt through every model dialog", async () => {
	const ctx = context({
		scopedModels: [],
		selections: [(choices: string[]) => choices[0], "medium"],
	});
	const picked = await resolveModelPolicy("pick", ctx, {
		mode: "spawn",
		picker: {
			title: "Model for Planner (1 of 4)",
			subject: "Planner",
			currentRef: "openai/gpt:high",
		},
	});
	assert.equal(picked.argument, "anthropic/claude:medium");
	assert.equal(ctx.selectCalls[0].title, "Model for Planner (1 of 4)");
	// The marker follows currentRef, not the picked row.
	assert.ok(ctx.selectCalls[0].choices.find((label: string) => label.startsWith("openai/gpt"))?.includes("· current"));
	assert.ok(!ctx.selectCalls[0].choices.find((label: string) => label.startsWith("anthropic/claude"))?.includes("· current"));
	assert.equal(ctx.selectCalls[1].title, "Thinking for Planner — anthropic/claude");
});

test("model policies cover parent, previous, pick, explicit, omitted spawn, and legacy resume", async () => {
	const parent = await resolveModelPolicy("parent", context(), { mode: "spawn" });
	assert.equal(parent.argument, "anthropic/claude:high");

	const previous = await resolveModelPolicy("previous", context(), {
		mode: "resume",
		profile: profile(),
	});
	assert.equal(previous.argument, "anthropic/claude:high");

	const explicit = await resolveModelPolicy("openai/gpt:high", context(), { mode: "spawn" });
	assert.equal(explicit.argument, "openai/gpt:high");

	const picked = await resolveModelPolicy("pick", context({
		selections: ["anthropic/claude · Claude · 200k", "medium"],
	}), { mode: "spawn" });
	assert.equal(picked.argument, "anthropic/claude:medium");

	const inherited = await resolveModelPolicy(undefined, context(), { mode: "spawn" });
	assert.equal(inherited.argument, "anthropic/claude:high");

	const agent = await resolveModelPolicy(undefined, context(), {
		mode: "spawn",
		agentModel: "openai/gpt",
		agentThinking: "high",
	});
	assert.equal(agent.argument, "openai/gpt:high");

	assert.deepEqual(
		await resolveModelPolicy(undefined, context(), { mode: "resume" }),
		{ source: "legacy" },
	);
});

test("previous is rejected for new spawns and unavailable saved models need correction", async () => {
	await assert.rejects(
		() => resolveModelPolicy("previous", context(), { mode: "spawn" }),
		/valid only when resuming/,
	);
	await assert.rejects(
		() => resolveModelPolicy("previous", context({ available: [other] }), {
			mode: "resume",
			profile: profile(),
		}),
		/not currently authenticated and available/,
	);
});

test("non-reasoning models expose only off in the thinking picker", async () => {
	const ctx = context({
		scopedModels: [],
		available: [plain],
		selections: ["local/plain · 32k", "off"],
	});
	const picked = await pickModelSelection(ctx, {});
	assert.equal(picked?.argument, "local/plain:off");
});

test("configured agent models resolve through the validated path with the configured source", () => {
	const resolved = resolveConfiguredAgentModel("anthropic/claude:high", context(), "scout");
	assert.equal(resolved.source, "configured");
	assert.equal(resolved.argument, "anthropic/claude:high");
	assert.deepEqual(resolved.selection, { provider: "anthropic", model: "claude", thinking: "high" });
	assert.equal(resolved.model, scoped);
});

test("configured agent models without a thinking suffix leave thinking unset", () => {
	const resolved = resolveConfiguredAgentModel("openai/gpt", context(), "worker");
	assert.equal(resolved.source, "configured");
	assert.equal(resolved.argument, "openai/gpt");
	assert.deepEqual(resolved.selection, { provider: "openai", model: "gpt" });
});

test("configured agent models name the agent and value when resolution fails", () => {
	assert.throws(
		() => resolveConfiguredAgentModel("missing/model:high", context(), "scout"),
		/Agent "scout" .*"missing\/model:high"[\s\S]*not authenticated and available/,
	);
	assert.throws(
		() => resolveConfiguredAgentModel("openai/gpt:minimal", context(), "worker"),
		/Agent "worker" .*"openai\/gpt:minimal"[\s\S]*does not support thinking level "minimal"/,
	);
});
