import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CliProxyApiModels } from "./cli-proxy-api-models.js";

const OPENAI_VARIANT = (effort) => ({
	reasoningEffort: effort,
	reasoningSummary: "auto",
	include: ["reasoning.encrypted_content"],
});

const gpt56Sol = {
	slug: "gpt-5.6-sol",
	display_name: "GPT 5.6 Sol",
	visibility: "list",
	context_window: 272000,
	max_context_window: 921000,
	max_tokens: 128000,
	input_modalities: ["text", "image"],
	service_tiers: [{ id: "priority", name: "Fast" }],
	supported_reasoning_levels: [
		{ effort: "low" },
		{ effort: "medium" },
		{ effort: "high" },
		{ effort: "xhigh" },
		{ effort: "max" },
		{ effort: "ultra" },
	],
};

const gpt54Mini = {
	slug: "gpt-5.4-mini",
	display_name: "GPT 5.4 Mini",
	visibility: "list",
	context_window: 272000,
	max_tokens: 128000,
	service_tiers: [],
	supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }, { effort: "xhigh" }],
};

const codexAutoReview = {
	slug: "codex-auto-review",
	display_name: "Codex Auto Review",
	visibility: "hide",
	context_window: 272000,
	max_tokens: 128000,
	supported_reasoning_levels: [{ effort: "medium" }],
};

const catalog = { models: [gpt56Sol, gpt54Mini, codexAutoReview] };

async function withCatalogServer(handler, fn) {
	const requests = [];
	const server = createServer((req, res) => {
		requests.push({ url: req.url, authorization: req.headers.authorization });
		const result = handler(req);
		res.statusCode = result.status ?? 200;
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify(result.body ?? {}));
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	try {
		return await fn({ baseURL: `http://127.0.0.1:${port}/v1`, requests });
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

async function withCacheDir(env, fn) {
	const cacheHome = mkdtempSync(join(tmpdir(), "cli-proxy-api-models-"));
	const previous = {};
	const vars = { XDG_CACHE_HOME: cacheHome, ...env };
	for (const [key, value] of Object.entries(vars)) {
		previous[key] = process.env[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		return await fn(join(cacheHome, "opencode", "cli-proxy-api-models.json"));
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(cacheHome, { recursive: true, force: true });
	}
}

function captureWarnings() {
	const warnings = [];
	const original = console.warn;
	console.warn = (...args) => warnings.push(args.join(" "));
	return {
		warnings,
		restore: () => {
			console.warn = original;
		},
	};
}

function providerConfig(baseURL, provider = {}) {
	return { provider: { openai: { options: { baseURL, apiKey: "sk-test" }, ...provider } } };
}

async function runPlugin(config) {
	const hooks = await CliProxyApiModels();
	await hooks.config(config);
	return config.provider.openai;
}

function writeCache(path, cache) {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, JSON.stringify(cache));
}

function cachedModel(id) {
	return { id, name: id, hidden: false, contextWindow: 1000, maxTokens: 100, efforts: ["low"], serviceTiers: [] };
}

async function waitFor(check, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("condition not met in time");
}

test("registers visible catalog models with names, limits, reasoning and variants", async () => {
	await withCacheDir({}, async () => {
		await withCatalogServer(() => ({ body: catalog }), async ({ baseURL, requests }) => {
			const provider = await runPlugin(providerConfig(baseURL));

			assert.deepEqual(requests, [{ url: "/v1/models?client_version=opencode", authorization: "Bearer sk-test" }]);
			assert.deepEqual(Object.keys(provider.models).sort(), ["gpt-5.4-mini", "gpt-5.6-sol", "gpt-5.6-sol-fast"]);

			const sol = provider.models["gpt-5.6-sol"];
			assert.equal(sol.name, "GPT 5.6 Sol");
			assert.equal(sol.reasoning, true);
			assert.deepEqual(sol.limit, { context: 272000, output: 128000 });
			assert.deepEqual(sol.variants.max, OPENAI_VARIANT("max"));
			assert.deepEqual(sol.variants.low, OPENAI_VARIANT("low"));
			// Advertised by the catalog, rejected by CLIProxyAPI.
			assert.deepEqual(sol.variants.ultra, { disabled: true });
			assert.deepEqual(sol.variants.none, { disabled: true });
			assert.deepEqual(sol.variants.minimal, { disabled: true });

			const fast = provider.models["gpt-5.6-sol-fast"];
			assert.equal(fast.name, "GPT 5.6 Sol Fast");
			assert.deepEqual(fast.limit, sol.limit);
			assert.deepEqual(fast.variants, sol.variants);

			const mini = provider.models["gpt-5.4-mini"];
			assert.deepEqual(mini.variants.xhigh, OPENAI_VARIANT("xhigh"));
			assert.deepEqual(mini.variants.max, { disabled: true });
			assert.deepEqual(mini.variants.ultra, { disabled: true });

			assert.deepEqual(provider.whitelist, ["gpt-5.4-mini", "gpt-5.6-sol", "gpt-5.6-sol-fast"]);
		});
	});
});

test("keeps user-configured whitelist entries", async () => {
	await withCacheDir({}, async () => {
		await withCatalogServer(() => ({ body: catalog }), async ({ baseURL }) => {
			const provider = await runPlugin(providerConfig(baseURL, { whitelist: ["custom-model"] }));
			assert.deepEqual(provider.whitelist, ["custom-model", "gpt-5.4-mini", "gpt-5.6-sol", "gpt-5.6-sol-fast"]);
		});
	});
});

test("does not replace user-defined models when overwrite is disabled", async () => {
	await withCacheDir({ OPENCODE_CLI_PROXY_MODELS_OVERWRITE: "0" }, async () => {
		await withCatalogServer(() => ({ body: catalog }), async ({ baseURL }) => {
			const provider = await runPlugin(providerConfig(baseURL, { models: { "gpt-5.6-sol": { name: "Mine" } } }));
			assert.deepEqual(provider.models["gpt-5.6-sol"], { name: "Mine" });
			assert.equal(provider.models["gpt-5.4-mini"].name, "GPT 5.4 Mini");
			assert.ok(provider.whitelist.includes("gpt-5.6-sol"));
		});
	});
});

test("serves a fresh cache without contacting the proxy", async () => {
	await withCacheDir({}, async (cachePath) => {
		await withCatalogServer(() => ({ body: catalog }), async ({ baseURL, requests }) => {
			writeCache(cachePath, {
				version: 2,
				modelsURL: `${baseURL}/models?client_version=opencode`,
				updatedAt: Date.now(),
				models: [cachedModel("cached-model")],
			});

			const provider = await runPlugin(providerConfig(baseURL));

			assert.equal(requests.length, 0);
			assert.deepEqual(Object.keys(provider.models), ["cached-model"]);
			assert.deepEqual(provider.models["cached-model"].limit, { context: 1000, output: 100 });
		});
	});
});

test("returns a stale cache immediately and refreshes it in the background", async () => {
	await withCacheDir({}, async (cachePath) => {
		await withCatalogServer(() => ({ body: catalog }), async ({ baseURL, requests }) => {
			const staleAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
			writeCache(cachePath, {
				version: 2,
				modelsURL: `${baseURL}/models?client_version=opencode`,
				updatedAt: staleAt,
				models: [cachedModel("stale-model")],
			});

			const provider = await runPlugin(providerConfig(baseURL));
			assert.deepEqual(Object.keys(provider.models), ["stale-model"]);

			await waitFor(() => JSON.parse(readFileSync(cachePath, "utf8")).updatedAt > staleAt);
			const refreshed = JSON.parse(readFileSync(cachePath, "utf8"));
			assert.equal(requests.length, 1);
			assert.deepEqual(
				refreshed.models.map((model) => [model.id, model.hidden]),
				[
					["gpt-5.6-sol", false],
					["gpt-5.4-mini", false],
					["codex-auto-review", true],
				],
			);
		});
	});
});

test("ignores a cache written for another catalog URL", async () => {
	await withCacheDir({}, async (cachePath) => {
		await withCatalogServer(() => ({ body: catalog }), async ({ baseURL, requests }) => {
			writeCache(cachePath, {
				version: 2,
				modelsURL: "http://127.0.0.1:1/v1/models?client_version=opencode",
				updatedAt: Date.now(),
				models: [cachedModel("other-proxy-model")],
			});

			const provider = await runPlugin(providerConfig(baseURL));

			assert.equal(requests.length, 1);
			assert.deepEqual(Object.keys(provider.models).sort(), ["gpt-5.4-mini", "gpt-5.6-sol", "gpt-5.6-sol-fast"]);
			assert.equal(JSON.parse(readFileSync(cachePath, "utf8")).modelsURL, `${baseURL}/models?client_version=opencode`);
		});
	});
});

test("leaves the provider untouched when discovery fails without a cache", async () => {
	const capture = captureWarnings();
	try {
		await withCacheDir({}, async () => {
			await withCatalogServer(() => ({ status: 500, body: {} }), async ({ baseURL }) => {
				const provider = await runPlugin(providerConfig(baseURL));
				assert.equal(provider.models, undefined);
				assert.equal(provider.whitelist, undefined);
			});
		});
	} finally {
		capture.restore();
	}
	assert.equal(capture.warnings.length, 1);
	assert.match(capture.warnings[0], /Model discovery failed: 500/);
});
