import assert from "node:assert/strict";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import { resolveCliModel } from "@earendil-works/pi-coding-agent";
import {
	resolvePiModelArgument,
	resolvePiModelSelection,
} from "../profiles/launch-policy.ts";

function model(id: string, provider = "p"): Model<Api> {
	return {
		provider,
		id,
		name: id,
		api: "openai-responses",
		baseUrl: "https://example.test",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_000,
	};
}

function registry(models: Model<Api>[]) {
	return {
		getAll: () => models,
		hasConfiguredAuth: () => true,
	};
}

test("separate thinking keeps existing precedence without a second suffix", () => {
	assert.equal(
		resolvePiModelArgument(
			{ name: "worker", task: "work", model: "p/m:high" },
			{ thinking: "low" },
			{},
			registry([model("m")]),
		),
		"p/m:low",
	);
});

test("structured policy records the actual model ID instead of a thinking suffix", () => {
	const models = [model("m")];
	const resolved = resolvePiModelSelection(
		{ name: "worker", task: "work", model: "p/m:high" },
		{ thinking: "low" },
		{},
		registry(models),
	);
	assert.deepEqual(resolved, {
		argument: "p/m",
		selection: { provider: "p", model: "m", thinking: "low" },
	});
	const cli = resolveCliModel({
		cliModel: resolved.argument,
		cliThinking: resolved.selection?.thinking,
		modelRuntime: {
			getModels: () => models,
			hasConfiguredAuth: () => true,
		} as unknown as Parameters<typeof resolveCliModel>[0]["modelRuntime"],
	});
	assert.equal(cli.error, undefined);
	assert.deepEqual(resolved.selection, {
		provider: cli.model?.provider,
		model: cli.model?.id,
		thinking: resolved.selection?.thinking ?? cli.thinkingLevel,
	});
});

test("registry IDs containing colons take precedence over thinking suffix parsing", () => {
	const models = registry([
		model("m"),
		model("m:high"),
		model("m:exacto"),
		model("qwen:7b"),
		model("vendor/m:exacto", "openrouter"),
	]);
	for (const [reference, thinking, expected] of [
		["p/m:high", undefined, { provider: "p", model: "m:high" }],
		["p/m:high", "low", { provider: "p", model: "m:high", thinking: "low" }],
		["p/m:exacto:high", "low", { provider: "p", model: "m:exacto", thinking: "low" }],
		["p/qwen:7b", "high", { provider: "p", model: "qwen:7b", thinking: "high" }],
		["openrouter/vendor/m:exacto:off", "low", {
			provider: "openrouter", model: "vendor/m:exacto", thinking: "low",
		}],
	] as const) {
		const resolved = resolvePiModelSelection(
			{ name: "worker", task: "work", model: reference },
			{ thinking },
			{},
			models,
		);
		assert.deepEqual(resolved.selection, expected, reference);
		assert.equal(
			resolved.argument,
			`${expected.provider}/${expected.model}`,
			reference,
		);
	}
});

test("model and thinking precedence stays consistent for tool, agent, and parent selections", () => {
	const parent = { model: model("parent"), thinkingLevel: "high" as const };
	const models = registry([model("tool"), model("agent"), parent.model]);
	for (const [toolModel, defaults, expected] of [
		["p/tool", { model: "p/agent", thinking: "low" }, { model: "tool", thinking: "low" }],
		["p/tool", { model: "p/agent" }, { model: "tool" }],
		[undefined, { model: "p/agent:high", thinking: "low" }, { model: "agent", thinking: "low" }],
		[undefined, { model: "p/agent" }, { model: "agent" }],
		[undefined, { thinking: "minimal" }, { model: "parent", thinking: "minimal" }],
		[undefined, null, { model: "parent", thinking: "high" }],
	] as const) {
		const resolved = resolvePiModelSelection(
			{ name: "worker", task: "work", model: toolModel },
			defaults,
			parent,
			models,
		);
		assert.deepEqual(resolved.selection, { provider: "p", ...expected });
		assert.equal(
			resolvePiModelArgument(
				{ name: "worker", task: "work", model: toolModel }, defaults, parent, models,
			),
			resolved.selection?.thinking
				? `${resolved.argument}:${resolved.selection.thinking}`
				: resolved.argument,
		);
	}
});

test("parent and inherit aliases preserve the parent identity and ignore agent defaults", () => {
	for (const alias of ["parent", "inherit"]) {
		const params = { name: "worker", task: "work", model: alias };
		const defaults = { model: "p/agent", thinking: "low" };
		assert.deepEqual(resolvePiModelSelection(params, defaults, {
			model: model("m:high"), thinkingLevel: "high",
		}), {
			argument: "p/m:high",
			selection: { provider: "p", model: "m:high", thinking: "high" },
		});
		assert.deepEqual(resolvePiModelSelection(params, defaults, { model: model("m:high") }), {
			argument: "p/m:high",
			selection: { provider: "p", model: "m:high" },
		});
		assert.throws(
			() => resolvePiModelSelection(params, defaults, {}),
			/The parent session has no active model/,
		);
	}
});

test("CLI fuzzy references are canonicalized before recording the model identity", () => {
	assert.deepEqual(resolvePiModelSelection(
		{ name: "worker", task: "work", model: "p/m" },
		{ thinking: "low" },
		{},
		registry([model("m-latest")]),
	), {
		argument: "p/m-latest",
		selection: { provider: "p", model: "m-latest", thinking: "low" },
	});
});

test("bare references use the SDK authenticated-provider disambiguation", () => {
	const models = [model("m", "p"), model("m", "q")];
	assert.deepEqual(resolvePiModelSelection(
		{ name: "worker", task: "work", model: "m" },
		null,
		{},
		{
			getAll: () => models,
			hasConfiguredAuth: (candidate: Model<Api>) => candidate.provider === "q",
		},
	), {
		argument: "q/m",
		selection: { provider: "q", model: "m" },
	});
	assert.throws(
		() => resolvePiModelSelection(
			{ name: "worker", task: "work", model: "m" }, null, {}, registry(models),
		),
		/ambiguous across providers/,
	);
});

test("unresolvable models fail instead of recording a guessed identity", () => {
	assert.throws(
		() => resolvePiModelSelection(
			{ name: "worker", task: "work", model: "missing/m" },
			null,
			{},
			registry([model("m")]),
		),
		/not found/,
	);
});

test("omitted and argument-only compatibility calls do not invent persisted identities", () => {
	const params = { name: "worker", task: "work" };
	assert.deepEqual(resolvePiModelSelection(params, null, { thinkingLevel: "high" }), {});
	assert.equal(resolvePiModelArgument(params, null, { thinkingLevel: "high" }), undefined);
	assert.deepEqual(resolvePiModelSelection(
		{ ...params, model: "p/m" }, { thinking: "low" }, {},
	), { argument: "p/m:low" });
});

test("thinking flags cannot select a different colon-containing registry ID", () => {
	const models = [model("m"), model("m:low")];
	const resolved = resolvePiModelSelection(
		{ name: "worker", task: "work", model: "p/m" },
		{ thinking: "low" },
		{},
		registry(models),
	);
	const cli = resolveCliModel({
		cliModel: resolved.argument,
		cliThinking: resolved.selection?.thinking,
		modelRuntime: {
			getModels: () => models,
			hasConfiguredAuth: () => true,
		} as unknown as Parameters<typeof resolveCliModel>[0]["modelRuntime"],
	});
	assert.equal(cli.error, undefined);
	assert.equal(cli.model?.id, resolved.selection?.model);
});
