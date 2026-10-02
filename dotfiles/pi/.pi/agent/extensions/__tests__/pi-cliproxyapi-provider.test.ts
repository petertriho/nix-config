import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type AssistantMessage, normalizeContext } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ProviderConfig,
	RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import cliproxyapi, {
	buildCostCatalog,
	type CodexCatalogModel,
	type ProviderChatModelConfig,
	fetchCodexModels,
	loadCostCatalog,
	MODEL_CATALOG_REFRESHED_EVENT,
	matchModelCost,
	normalizeTransientNetworkError,
	PauseController,
	parseLegacyModelsCache,
	parseModelsCache,
	readPauseSetting,
	readFastSetting,
	resolveEndpoints,
	savePauseSetting,
	saveFastSetting,
	toPiModel,
	waitForPauseToEnd,
} from "../pi-cliproxyapi-provider.ts";

// Fixtures trimmed from the live `/v1/models?client_version=pi` catalog.
const gpt56Sol: CodexCatalogModel = {
	slug: "gpt-5.6-sol",
	display_name: "GPT 5.6 Sol",
	context_window: 272000,
	max_context_window: 921000,
	input_modalities: ["text", "image"],
	supported_reasoning_levels: [
		{ effort: "low", description: "Fast responses with lighter reasoning" },
		{ effort: "medium" },
		{ effort: "high" },
		{ effort: "xhigh" },
		{ effort: "max" },
		{ effort: "ultra" },
	],
	apply_patch_tool_type: "freeform",
	visibility: "list",
};

const gpt54Mini: CodexCatalogModel = {
	slug: "gpt-5.4-mini",
	display_name: "GPT 5.4 Mini",
	context_window: 272000,
	max_context_window: 272000,
	input_modalities: ["text", "image"],
	supported_reasoning_levels: [
		{ effort: "low" },
		{ effort: "medium" },
		{ effort: "high" },
		{ effort: "xhigh" },
	],
	visibility: "list",
};

const codexAutoReview: CodexCatalogModel = {
	slug: "codex-auto-review",
	display_name: "Codex Auto Review",
	context_window: 272000,
	input_modalities: ["text", "image"],
	supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }],
	visibility: "hide",
};

const expectedEndpoints = {
	inferenceBaseUrl: "http://127.0.0.1:8317/v1",
	modelsUrl: "http://127.0.0.1:8317/v1/models?client_version=pi",
};

test("resolveEndpoints derives /v1 and the catalog URL from a bare origin", () => {
	assert.deepEqual(resolveEndpoints("http://127.0.0.1:8317"), expectedEndpoints);
});

test("resolveEndpoints strips a trailing /v1", () => {
	assert.deepEqual(resolveEndpoints("http://127.0.0.1:8317/v1"), expectedEndpoints);
});

test("resolveEndpoints strips a trailing slash", () => {
	assert.deepEqual(resolveEndpoints("http://127.0.0.1:8317/"), expectedEndpoints);
});

test("resolveEndpoints defaults to the loopback proxy when the input is empty", () => {
	assert.deepEqual(resolveEndpoints(undefined), expectedEndpoints);
	assert.deepEqual(resolveEndpoints("  "), expectedEndpoints);
});

test("resolveEndpoints rejects an invalid proxy URL with context", () => {
	assert.throws(() => resolveEndpoints("http://["), /invalid CLIPROXYAPI_BASE_URL/i);
});

test("toPiModel maps gpt-5.6-sol and ignores the ultra effort", () => {
	const model = toPiModel(gpt56Sol);
	assert.ok(model);
	assert.equal(model.id, "gpt-5.6-sol");
	assert.equal(model.name, "GPT 5.6 Sol");
	assert.equal(model.contextWindow, 272000);
	assert.equal(model.maxTokens, 128000);
	assert.equal(model.reasoning, true);
	assert.deepEqual(model.input, ["text", "image"]);
	assert.deepEqual(model.thinkingLevelMap, {
		off: null,
		minimal: null,
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: "max",
	});
	assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
	assert.deepEqual(model.compat, {
		sessionAffinityFormat: "openai",
		supportsLongCacheRetention: true,
		supportsOpenAIGrammarTools: true,
	});
});

test("toPiModel enables grammar tools only for normalized freeform capability", () => {
	for (const value of [" FREEFORM ", "FreeForm"]) {
		const model = toPiModel({ slug: `supported-${value.trim()}`, apply_patch_tool_type: value });
		assert.ok(model);
		assert.deepEqual(model.compat, {
			sessionAffinityFormat: "openai",
			supportsLongCacheRetention: true,
			supportsOpenAIGrammarTools: true,
		});
	}

	for (const value of [undefined, "", "   ", "function", "free-form", 123, { type: "freeform" }, ["freeform"]]) {
		const model = toPiModel({
			slug: `unsupported-${String(value)}`,
			apply_patch_tool_type: value,
		});
		assert.ok(model);
		assert.deepEqual(model.compat, {
			sessionAffinityFormat: "openai",
			supportsLongCacheRetention: true,
			supportsOpenAIGrammarTools: false,
		});
	}
});

test("toPiModel marks unsupported levels null for gpt-5.4-mini", () => {
	const model = toPiModel(gpt54Mini);
	assert.ok(model);
	assert.equal(model.thinkingLevelMap?.max, null);
	assert.equal(model.thinkingLevelMap?.xhigh, "xhigh");
});

test("toPiModel skips hidden catalog entries", () => {
	assert.equal(toPiModel(codexAutoReview), null);
});

test("toPiModel applies context, modality, and reasoning fallbacks", () => {
	const fromMax = toPiModel({ slug: "a", max_context_window: 400000 });
	assert.ok(fromMax);
	assert.equal(fromMax.contextWindow, 400000);
	assert.equal(fromMax.name, "a");
	assert.deepEqual(fromMax.input, ["text"]);
	assert.equal(fromMax.reasoning, false);
	assert.equal(fromMax.thinkingLevelMap, undefined);

	const bare = toPiModel({ slug: "b", input_modalities: ["image"] });
	assert.ok(bare);
	assert.equal(bare.contextWindow, 128000);
	assert.deepEqual(bare.input, ["text", "image"]);

	assert.equal(toPiModel({ display_name: "no slug" }), null);
});

test("toPiModel maps a `none` effort to off", () => {
	const model = toPiModel({
		slug: "c",
		supported_reasoning_levels: ["none", "low"],
	});
	assert.ok(model);
	assert.equal(model.reasoning, true);
	assert.equal(model.thinkingLevelMap?.off, "none");
	assert.equal(model.thinkingLevelMap?.low, "low");
});

test("parseModelsCache accepts version 2 and rejects version 1 for the same catalog URL", () => {
	const model = toPiModel(gpt56Sol);
	const cache = {
		modelsUrl: expectedEndpoints.modelsUrl,
		fetchedAt: 1,
		models: [model],
	};
	assert.deepEqual(parseModelsCache({ version: 2, ...cache }, expectedEndpoints.modelsUrl), [model]);
	assert.equal(parseModelsCache({ version: 1, ...cache }, expectedEndpoints.modelsUrl), null);
});

test("parseLegacyModelsCache accepts only version 1 and forces grammar support off", () => {
	const model = toPiModel(gpt56Sol);
	assert.ok(model);
	const parsed = parseLegacyModelsCache(
		{
			version: 1,
			modelsUrl: expectedEndpoints.modelsUrl,
			fetchedAt: 1,
			models: [model],
		},
		expectedEndpoints.modelsUrl,
	);
	assert.ok(parsed);
	assert.equal(parsed.length, 1);
	assert.deepEqual(parsed[0]?.compat, {
		sessionAffinityFormat: "openai",
		supportsLongCacheRetention: true,
		supportsOpenAIGrammarTools: false,
	});
	assert.equal(parseLegacyModelsCache({ version: 2, models: [model] }, expectedEndpoints.modelsUrl), null);
});

test("parseModelsCache rejects the upstream pi-cliproxyapi-provider schema", () => {
	const upstream = {
		models: [toPiModel(gpt56Sol)],
		fastModelIds: [],
		inferenceBaseUrl: "http://127.0.0.1:8317/backend-api/",
		modelsUrl: expectedEndpoints.modelsUrl,
		fetchedAt: 1,
	};
	assert.equal(parseModelsCache(upstream, expectedEndpoints.modelsUrl), null);
});

test("parseModelsCache rejects a different catalog URL and malformed models", () => {
	const model = toPiModel(gpt56Sol);
	const base = { version: 2, fetchedAt: 1, models: [model] };
	assert.equal(
		parseModelsCache(
			{ ...base, modelsUrl: "http://other:1/v1/models?client_version=pi" },
			expectedEndpoints.modelsUrl,
		),
		null,
	);
	assert.equal(
		parseModelsCache(
			{ ...base, modelsUrl: expectedEndpoints.modelsUrl, models: [{ id: "x" }] },
			expectedEndpoints.modelsUrl,
		),
		null,
	);
	assert.equal(parseModelsCache("nope", expectedEndpoints.modelsUrl), null);
});

test("catalog caches accept chat models and reject non-chat model types", () => {
	const model = toPiModel(gpt56Sol);
	assert.ok(model);
	for (const version of [1, 2]) {
		const parse = version === 1 ? parseLegacyModelsCache : parseModelsCache;
		const cache = {
			version,
			modelsUrl: expectedEndpoints.modelsUrl,
			fetchedAt: 1,
		};
		for (const type of [undefined, "chat"]) {
			assert.ok(parse({ ...cache, models: [{ ...model, type }] }, expectedEndpoints.modelsUrl));
		}
		for (const type of ["image", "classifier", "unknown", null]) {
			assert.equal(parse({ ...cache, models: [{ ...model, type }] }, expectedEndpoints.modelsUrl), null);
		}
	}
});

async function withCatalogServer(
	respond: (url: string) => { status: number; body: unknown },
	run: (baseUrl: string, requests: Array<{ url: string; auth?: string }>) => Promise<void>,
): Promise<void> {
	const requests: Array<{ url: string; auth?: string }> = [];
	const server = createServer((req, res) => {
		requests.push({ url: req.url ?? "", auth: req.headers.authorization });
		const { status, body } = respond(req.url ?? "");
		res.writeHead(status, { "content-type": "application/json" });
		res.end(JSON.stringify(body));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	try {
		await run(`http://127.0.0.1:${port}`, requests);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

test("fetchCodexModels sends the bearer token and accepts models[], data[], and bare arrays", async () => {
	await withCatalogServer(
		(url) => {
			if (url.includes("shape=models")) return { status: 200, body: { models: [gpt56Sol] } };
			if (url.includes("shape=data")) return { status: 200, body: { data: [gpt54Mini] } };
			return { status: 200, body: [codexAutoReview] };
		},
		async (baseUrl, requests) => {
			assert.deepEqual(await fetchCodexModels(`${baseUrl}/v1/models?shape=models`, "sk-test", 1000), [gpt56Sol]);
			assert.deepEqual(await fetchCodexModels(`${baseUrl}/v1/models?shape=data`, "sk-test", 1000), [gpt54Mini]);
			assert.deepEqual(await fetchCodexModels(`${baseUrl}/v1/models?shape=bare`, undefined, 1000), [
				codexAutoReview,
			]);
			assert.equal(requests[0]?.auth, "Bearer sk-test");
			assert.equal(requests[2]?.auth, undefined);
		},
	);
});

test("fetchCodexModels throws on a non-2xx status and on an unexpected payload", async () => {
	await withCatalogServer(
		(url) => (url.includes("bad") ? { status: 503, body: { error: "down" } } : { status: 200, body: { nope: 1 } }),
		async (baseUrl) => {
			await assert.rejects(fetchCodexModels(`${baseUrl}/bad`, "k", 1000), /503/);
			await assert.rejects(fetchCodexModels(`${baseUrl}/odd`, "k", 1000), /unexpected/i);
		},
	);
});

// --- Extension harness: drives the default export against a local catalog
// server and a temporary agent dir (PI_CODING_AGENT_DIR).

type EventHandler = (event: unknown, ctx: ExtensionCommandContext) => unknown;

type Harness = {
	pi: ExtensionAPI;
	ctx: ExtensionCommandContext;
	providers: Array<{
		id: string;
		config: Omit<ProviderConfig, "models"> & { models?: ProviderChatModelConfig[] };
	}>;
	emittedEvents: Array<{ channel: string; data: unknown }>;
	commands: Map<string, RegisteredCommand["handler"]>;
	handlers: Map<string, EventHandler[]>;
	notifications: Array<{ message: string; type?: string }>;
	statuses: Map<string, string | undefined>;
	/** Build a ctx for a request from the given provider, sharing the harness UI. */
	requestCtx(provider: string, signal?: AbortSignal): ExtensionCommandContext;
};

function createHarness(): Harness {
	const providers: Harness["providers"] = [];
	const emittedEvents: Harness["emittedEvents"] = [];
	const commands: Harness["commands"] = new Map();
	const handlers: Harness["handlers"] = new Map();
	const notifications: Harness["notifications"] = [];
	const statuses: Harness["statuses"] = new Map();
	const pi = {
		registerProvider(id: string, config: ProviderConfig) {
			const models = config.models?.map((model) => {
				assert.ok(model.type === undefined || model.type === "chat");
				return model;
			});
			providers.push({ id, config: { ...config, models } });
		},
		registerCommand(name: string, options: Pick<RegisteredCommand, "handler">) {
			commands.set(name, options.handler);
		},
		on(event: string, handler: EventHandler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		events: {
			emit(channel: string, data: unknown) {
				emittedEvents.push({ channel, data });
			},
			on() {
				return () => {};
			},
		},
	} as unknown as ExtensionAPI;
	const ui = {
		notify(message: string, type?: string) {
			notifications.push({ message, type });
		},
		setStatus(key: string, text: string | undefined) {
			statuses.set(key, text);
		},
	};
	const ctx = { ui } as unknown as ExtensionCommandContext;
	const requestCtx = (provider: string, signal?: AbortSignal) =>
		({ ui, model: { provider }, signal }) as unknown as ExtensionCommandContext;
	return {
		pi,
		ctx,
		providers,
		emittedEvents,
		commands,
		handlers,
		notifications,
		statuses,
		requestCtx,
	};
}

async function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
	const saved = new Map(Object.keys(vars).map((key) => [key, process.env[key]]));
	for (const [key, value] of Object.entries(vars)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		await run();
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

async function withTempAgentDir(run: (agentDir: string) => Promise<void>): Promise<void> {
	const agentDir = mkdtempSync(join(tmpdir(), "cliproxyapi-test-"));
	try {
		await run(agentDir);
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
}

async function captureWarnings(run: (warnings: string[]) => Promise<void>): Promise<void> {
	const warnings: string[] = [];
	const original = console.warn;
	console.warn = (...args: unknown[]) => {
		warnings.push(args.map(String).join(" "));
	};
	try {
		await run(warnings);
	} finally {
		console.warn = original;
	}
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error("waitFor timed out");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

/** Reserve a loopback port and release it, so connections to it are refused. */
async function closedPortBaseUrl(): Promise<string> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return `http://127.0.0.1:${port}`;
}

const modelIds = (harness: Harness, index: number): string[] =>
	(harness.providers[index]?.config.models ?? []).map((model) => model.id);

/** A fresh models.dev cache keeps the harness off the network. */
function writeFreshModelsDevCache(agentDir: string, providers: Record<string, unknown>): void {
	mkdirSync(join(agentDir, "tmp"), { recursive: true });
	writeFileSync(join(agentDir, "tmp", "models-dev-cache.json"), JSON.stringify({ timestamp: Date.now(), providers }));
}

const emptyModelsDevProviders = { none: { models: {} } };

test("startup without a cache fetches, registers, writes a version 2 cache, and /cliproxyapi-refresh re-registers", async () => {
	await withCatalogServer(
		() => ({ status: 200, body: { models: [gpt56Sol, gpt54Mini, codexAutoReview] } }),
		async (baseUrl, requests) => {
			await withTempAgentDir(async (agentDir) => {
				writeFreshModelsDevCache(agentDir, modelsDevProviders);
				await withEnv(
					{ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: `${baseUrl}/v1`, CLIPROXYAPI_API_KEY: "sk-harness" },
					async () => {
						const harness = createHarness();
						await cliproxyapi(harness.pi);

						assert.equal(harness.providers.length, 1);
						const { id, config } = harness.providers[0]!;
						assert.equal(id, "cliproxyapi");
						assert.equal(config.name, "CLIProxyAPI");
						assert.equal(config.api, "openai-responses");
						assert.equal(config.baseUrl, `${baseUrl}/v1`);
						assert.equal(config.apiKey, "$CLIPROXYAPI_API_KEY");
						assert.deepEqual(modelIds(harness, 0), ["gpt-5.6-sol", "gpt-5.4-mini"]);
						assert.equal(requests[0]?.url, "/v1/models?client_version=pi");
						assert.equal(requests[0]?.auth, "Bearer sk-harness");

						const cache = JSON.parse(readFileSync(join(agentDir, "cliproxyapi-models.json"), "utf8"));
						assert.equal(cache.version, 2);
						assert.equal(cache.modelsUrl, `${baseUrl}/v1/models?client_version=pi`);
						assert.equal(typeof cache.fetchedAt, "number");
						assert.deepEqual(parseModelsCache(cache, cache.modelsUrl), config.models);
						assert.deepEqual(config.models?.[0]?.cost, gpt56SolCost);
						assert.equal(cache.models[0].cost.tiers[0].inputTokensAbove, 272000);
						assert.deepEqual(harness.emittedEvents, [
							{
								channel: MODEL_CATALOG_REFRESHED_EVENT,
								data: { provider: "cliproxyapi" },
							},
						]);

						const refresh = harness.commands.get("cliproxyapi-refresh");
						assert.ok(refresh);
						await refresh("extra", harness.ctx);
						assert.equal(harness.notifications.at(-1)?.type, "error");
						assert.equal(harness.providers.length, 1);

						await refresh("", harness.ctx);
						assert.deepEqual(harness.notifications.at(-1), {
							message: "CLIProxyAPI: registered 2 models",
							type: "info",
						});
						assert.equal(harness.providers.length, 2);
						assert.equal(requests.length, 2);
						assert.deepEqual(harness.emittedEvents.at(-1), {
							channel: MODEL_CATALOG_REFRESHED_EVENT,
							data: { provider: "cliproxyapi" },
						});
						assert.equal(harness.emittedEvents.length, 2);
					},
				);
			});
		},
	);
});

test("startup preserves models with non-string capability metadata and disables grammar tools", async () => {
	const changedShapeModels = [123, { type: "freeform" }, ["freeform"]].map((apply_patch_tool_type, index) => ({
		slug: `changed-shape-${index}`,
		apply_patch_tool_type,
	}));
	await withCatalogServer(
		() => ({ status: 200, body: { models: changedShapeModels } }),
		async (baseUrl) => {
			await withTempAgentDir(async (agentDir) => {
				writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
				await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
					const harness = createHarness();
					await cliproxyapi(harness.pi);

					assert.equal(harness.providers.length, 1);
					assert.deepEqual(modelIds(harness, 0), ["changed-shape-0", "changed-shape-1", "changed-shape-2"]);
					for (const model of harness.providers[0]?.config.models ?? []) {
						assert.deepEqual(model.compat, {
							sessionAffinityFormat: "openai",
							supportsLongCacheRetention: true,
							supportsOpenAIGrammarTools: false,
						});
					}
					const cache = JSON.parse(readFileSync(join(agentDir, "cliproxyapi-models.json"), "utf8"));
					assert.equal(cache.version, 2);
					assert.deepEqual(parseModelsCache(cache, cache.modelsUrl), harness.providers[0]?.config.models);
				});
			});
		},
	);
});

test("startup with a valid cache registers at once and keeps cached models when the refresh fails", async () => {
	const baseUrl = await closedPortBaseUrl();
	const modelsUrl = `${baseUrl}/v1/models?client_version=pi`;
	await withTempAgentDir(async (agentDir) => {
		writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
		writeFileSync(
			join(agentDir, "cliproxyapi-models.json"),
			JSON.stringify({ version: 2, modelsUrl, fetchedAt: 1, models: [toPiModel(gpt54Mini)] }),
		);
		await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
			await captureWarnings(async (warnings) => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				assert.deepEqual(modelIds(harness, 0), ["gpt-5.4-mini"]);

				await waitFor(() => warnings.length > 0);
				assert.equal(warnings.length, 1);
				assert.match(warnings[0]!, /background model refresh failed/);
				assert.equal(harness.providers.length, 1);
			});
		});
	});
});

test("startup with a legacy cache refreshes synchronously and registers version 2 models", async () => {
	await withCatalogServer(
		() => ({ status: 200, body: { models: [gpt56Sol] } }),
		async (baseUrl, requests) => {
			const modelsUrl = `${baseUrl}/v1/models?client_version=pi`;
			await withTempAgentDir(async (agentDir) => {
				writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
				writeFileSync(
					join(agentDir, "cliproxyapi-models.json"),
					JSON.stringify({ version: 1, modelsUrl, fetchedAt: 1, models: [toPiModel(gpt54Mini)] }),
				);
				await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
					const harness = createHarness();
					await cliproxyapi(harness.pi);

					assert.equal(requests.length, 1);
					assert.equal(harness.providers.length, 1);
					assert.deepEqual(modelIds(harness, 0), ["gpt-5.6-sol"]);
					assert.deepEqual(harness.providers[0]?.config.models?.[0]?.compat, {
						sessionAffinityFormat: "openai",
						supportsLongCacheRetention: true,
						supportsOpenAIGrammarTools: true,
					});
					const cache = JSON.parse(readFileSync(join(agentDir, "cliproxyapi-models.json"), "utf8"));
					assert.equal(cache.version, 2);
					assert.deepEqual(parseModelsCache(cache, modelsUrl), harness.providers[0]?.config.models);
				});
			});
		},
	);
});

test("startup with an unavailable proxy safely registers legacy models and warns once", async () => {
	const baseUrl = await closedPortBaseUrl();
	const modelsUrl = `${baseUrl}/v1/models?client_version=pi`;
	await withTempAgentDir(async (agentDir) => {
		writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
		writeFileSync(
			join(agentDir, "cliproxyapi-models.json"),
			JSON.stringify({ version: 1, modelsUrl, fetchedAt: 1, models: [toPiModel(gpt56Sol)] }),
		);
		await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
			await captureWarnings(async (warnings) => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);

				assert.equal(harness.providers.length, 1);
				assert.deepEqual(modelIds(harness, 0), ["gpt-5.6-sol"]);
				assert.deepEqual(harness.providers[0]?.config.models?.[0]?.compat, {
					sessionAffinityFormat: "openai",
					supportsLongCacheRetention: true,
					supportsOpenAIGrammarTools: false,
				});
				assert.equal(warnings.length, 1);
				assert.match(warnings[0]!, /legacy model cache/i);
				assert.match(warnings[0]!, /reselect.*model|\/reload/i);
				const cache = JSON.parse(readFileSync(join(agentDir, "cliproxyapi-models.json"), "utf8"));
				assert.equal(cache.version, 1);
			});
		});
	});
});

test("a later refresh replaces a legacy fallback with version 2 and gives a reload hint", async () => {
	let catalogRequests = 0;
	await withCatalogServer(
		() =>
			++catalogRequests === 1
				? { status: 503, body: { error: "temporarily unavailable" } }
				: { status: 200, body: { models: [gpt56Sol] } },
		async (baseUrl) => {
			const modelsUrl = `${baseUrl}/v1/models?client_version=pi`;
			await withTempAgentDir(async (agentDir) => {
				writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
				writeFileSync(
					join(agentDir, "cliproxyapi-models.json"),
					JSON.stringify({ version: 1, modelsUrl, fetchedAt: 1, models: [toPiModel(gpt54Mini)] }),
				);
				await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
					await captureWarnings(async (warnings) => {
						const harness = createHarness();
						await cliproxyapi(harness.pi);
						assert.equal(warnings.length, 1);

						const refresh = harness.commands.get("cliproxyapi-refresh");
						assert.ok(refresh);
						await refresh("", harness.ctx);

						assert.equal(harness.providers.length, 2);
						assert.deepEqual(modelIds(harness, 1), ["gpt-5.6-sol"]);
						assert.equal(harness.notifications.at(-1)?.type, "warning");
						assert.match(harness.notifications.at(-1)?.message ?? "", /reselect.*model|\/reload/i);
						const cache = JSON.parse(readFileSync(join(agentDir, "cliproxyapi-models.json"), "utf8"));
						assert.equal(cache.version, 2);
						assert.deepEqual(parseModelsCache(cache, modelsUrl), harness.providers[1]?.config.models);
					});
				});
			});
		},
	);
});

test("startup without a cache and without a proxy registers nothing and warns once", async () => {
	const baseUrl = await closedPortBaseUrl();
	await withTempAgentDir(async (agentDir) => {
		writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
		await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
			await captureWarnings(async (warnings) => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				assert.equal(harness.providers.length, 0);
				assert.equal(warnings.length, 1);
				assert.match(warnings[0]!, /model discovery failed/);
				assert.equal(existsSync(join(agentDir, "cliproxyapi-models.json")), false);
				assert.ok(harness.commands.has("cliproxyapi-refresh"));
			});
		});
	});
});

// --- models.dev pricing (T2)

// Trimmed from the live models.dev api.json: openai and opencode disagree on
// gpt-5.6-sol, and gpt-5.4-mini has no tiers.
const modelsDevProviders = {
	openai: {
		models: {
			"gpt-5.6-sol": {
				cost: {
					input: 5,
					output: 30,
					cache_read: 0.5,
					cache_write: 6.25,
					tiers: [{ input: 10, output: 45, cache_read: 1, cache_write: 12.5, tier: { type: "context", size: 272000 } }],
					context_over_200k: { input: 10, output: 45, cache_read: 1, cache_write: 12.5 },
				},
			},
			"gpt-5.4-mini": { cost: { input: 0.75, output: 4.5, cache_read: 0.075 } },
		},
	},
	opencode: {
		models: {
			"gpt-5.6-sol": { cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 } },
			"gpt-5.4-mini": { cost: { input: 0.75, output: 4.5, cache_read: 0.075 } },
		},
	},
	"reseller-a": { models: { "other-model": { cost: { input: 1, output: 2 } } } },
	"reseller-b": { models: { "other-model": { cost: { input: 3, output: 4 } } } },
	"legacy-provider": {
		models: {
			"legacy-model": { cost: { input: 1, output: 2, context_over_200k: { input: 2, output: 4 } } },
		},
	},
};

const gpt56SolCost = {
	input: 5,
	output: 30,
	cacheRead: 0.5,
	cacheWrite: 6.25,
	tiers: [{ input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5, inputTokensAbove: 272000 }],
};

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

test("matchModelCost prefers the openai entry for gpt ids and maps the 272000 tier", () => {
	const catalog = buildCostCatalog(modelsDevProviders);
	assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog), gpt56SolCost);
});

test("matchModelCost uses identical reseller prices and falls back to zero when they differ", () => {
	const catalog = buildCostCatalog(modelsDevProviders);
	assert.deepEqual(matchModelCost("gpt-5.4-mini", catalog), {
		input: 0.75,
		output: 4.5,
		cacheRead: 0.075,
		cacheWrite: 0,
	});
	assert.deepEqual(matchModelCost("other-model", catalog), zeroCost);
	assert.deepEqual(matchModelCost("unknown-model", catalog), zeroCost);
});

test("matchModelCost falls back to a normalized id and to context_over_200k", () => {
	const catalog = buildCostCatalog(modelsDevProviders);
	assert.deepEqual(matchModelCost("gpt-5-6-sol", catalog), gpt56SolCost);
	assert.deepEqual(matchModelCost("legacy-model", catalog), {
		input: 1,
		output: 2,
		cacheRead: 0,
		cacheWrite: 0,
		tiers: [{ input: 2, output: 4, cacheRead: 0, cacheWrite: 0, inputTokensAbove: 200000 }],
	});
});

test("toPiModel takes its cost from the catalog", () => {
	const model = toPiModel(gpt56Sol, buildCostCatalog(modelsDevProviders));
	assert.deepEqual(model?.cost, gpt56SolCost);
});

const HOUR_MS = 60 * 60 * 1000;

function fetchStub(result: { ok: boolean; body?: unknown } | Error) {
	const calls: string[] = [];
	const impl = (async (input: string | URL | Request) => {
		calls.push(String(input));
		if (result instanceof Error) throw result;
		return { ok: result.ok, json: async () => result.body } as Response;
	}) as typeof fetch;
	return { impl, calls };
}

test("loadCostCatalog reads a fresh cache without a network request", async () => {
	await withTempAgentDir(async (dir) => {
		const cachePath = join(dir, "models-dev-cache.json");
		const now = Date.now();
		writeFileSync(cachePath, JSON.stringify({ timestamp: now - HOUR_MS, providers: modelsDevProviders }));
		const stub = fetchStub(new Error("must not be called"));
		const catalog = await loadCostCatalog(cachePath, { fetchImpl: stub.impl, now });
		assert.deepEqual(stub.calls, []);
		assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog), gpt56SolCost);
	});
});

test("loadCostCatalog refreshes a stale cache and rewrites it", async () => {
	await withTempAgentDir(async (dir) => {
		const cachePath = join(dir, "tmp", "models-dev-cache.json");
		const now = Date.now();
		const stub = fetchStub({ ok: true, body: modelsDevProviders });
		const catalog = await loadCostCatalog(cachePath, { fetchImpl: stub.impl, now });
		assert.deepEqual(stub.calls, ["https://models.dev/api.json"]);
		assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog), gpt56SolCost);
		const written = JSON.parse(readFileSync(cachePath, "utf8"));
		assert.equal(written.timestamp, now);
		assert.deepEqual(Object.keys(written.providers), Object.keys(modelsDevProviders));
	});
});

test("loadCostCatalog falls back to the stale cache when the fetch fails", async () => {
	await withTempAgentDir(async (dir) => {
		const cachePath = join(dir, "models-dev-cache.json");
		const now = Date.now();
		const stale = JSON.stringify({ timestamp: now - 25 * HOUR_MS, providers: modelsDevProviders });
		writeFileSync(cachePath, stale);
		const stub = fetchStub(new Error("offline"));
		const catalog = await loadCostCatalog(cachePath, { fetchImpl: stub.impl, now });
		assert.equal(stub.calls.length, 1);
		assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog), gpt56SolCost);
		assert.equal(readFileSync(cachePath, "utf8"), stale);

		const rejected = await loadCostCatalog(cachePath, { fetchImpl: fetchStub({ ok: false }).impl, now });
		assert.deepEqual(matchModelCost("gpt-5.6-sol", rejected), gpt56SolCost);
	});
});

test("loadCostCatalog returns an empty catalog without cache or network", async () => {
	await withTempAgentDir(async (dir) => {
		const cachePath = join(dir, "models-dev-cache.json");
		const catalog = await loadCostCatalog(cachePath, { fetchImpl: fetchStub(new Error("offline")).impl });
		assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog), zeroCost);
		assert.equal(existsSync(cachePath), false);
	});
});

// --- /pause and /continue (T3)

test("readPauseSetting reports false for a missing file and rejects non-boolean values", async () => {
	await withTempAgentDir(async (dir) => {
		const configPath = join(dir, "cliproxyapi.json");
		assert.equal(readPauseSetting(configPath), false);
		writeFileSync(configPath, JSON.stringify({ pause: true }));
		assert.equal(readPauseSetting(configPath), true);
		writeFileSync(configPath, JSON.stringify({ pause: "yes" }));
		assert.throws(() => readPauseSetting(configPath), /must be a boolean/);

		writeFileSync(configPath, "{");
		assert.throws(() => readPauseSetting(configPath), /invalid cliproxyapi\.json/i);
	});
});

test("savePauseSetting keeps unrelated keys", async () => {
	await withTempAgentDir(async (dir) => {
		const configPath = join(dir, "nested", "cliproxyapi.json");
		savePauseSetting(configPath, true);
		assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { pause: true });
		writeFileSync(configPath, JSON.stringify({ baseUrl: "http://example", pause: true }));
		savePauseSetting(configPath, false);
		assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { baseUrl: "http://example", pause: false });
	});
});

test("waitForPauseToEnd resolves at once when not paused", async () => {
	await withTempAgentDir(async (dir) => {
		const controller = new PauseController(false);
		await waitForPauseToEnd(join(dir, "cliproxyapi.json"), controller, { pollMs: 5 });
		assert.equal(controller.isPaused(), false);
	});
});

test("waitForPauseToEnd waits until the file flips to false", async () => {
	await withTempAgentDir(async (dir) => {
		const configPath = join(dir, "cliproxyapi.json");
		writeFileSync(configPath, JSON.stringify({ pause: true }));
		const controller = new PauseController(true);
		let released = false;
		const gate = waitForPauseToEnd(configPath, controller, { pollMs: 5 }).then(() => {
			released = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(released, false);
		// Another pi instance writes the file.
		writeFileSync(configPath, JSON.stringify({ pause: false }));
		await gate;
		assert.equal(controller.isPaused(), false);
	});
});

test("waitForPauseToEnd keeps the in-memory state when the file is unreadable and stops on abort", async () => {
	await withTempAgentDir(async (dir) => {
		const configPath = join(dir, "cliproxyapi.json");
		writeFileSync(configPath, "{not json");
		const controller = new PauseController(true);
		const abort = new AbortController();
		let released = false;
		const gate = waitForPauseToEnd(configPath, controller, { pollMs: 5, signal: abort.signal }).then(() => {
			released = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(released, false);
		abort.abort();
		await gate;
		assert.equal(controller.isPaused(), true);
	});
});

test("/pause gates cliproxyapi requests until /continue, and leaves other providers alone", async () => {
	const baseUrl = await closedPortBaseUrl();
	await withTempAgentDir(async (agentDir) => {
		writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
		await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
			await captureWarnings(async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				const pause = harness.commands.get("pause");
				const resume = harness.commands.get("continue");
				const [gate] = harness.handlers.get("before_provider_request") ?? [];
				assert.ok(pause && resume && gate);

				await pause("now", harness.ctx);
				assert.equal(harness.notifications.at(-1)?.type, "error");
				assert.equal(readPauseSetting(join(agentDir, "cliproxyapi.json")), false);

				await pause("", harness.ctx);
				assert.equal(harness.statuses.get("cliproxyapi"), "paused");
				assert.equal(readPauseSetting(join(agentDir, "cliproxyapi.json")), true);
				assert.match(harness.notifications.at(-1)?.message ?? "", /paused/i);

				// Other providers are not gated.
				await gate({ type: "before_provider_request", payload: {} }, harness.requestCtx("anthropic"));

				let released = false;
				const request = Promise.resolve(
					gate({ type: "before_provider_request", payload: {} }, harness.requestCtx("cliproxyapi")),
				).then(() => {
					released = true;
				});
				await new Promise((resolve) => setTimeout(resolve, 30));
				assert.equal(released, false);

				await resume("", harness.ctx);
				await request;
				assert.equal(harness.statuses.get("cliproxyapi"), undefined);
				assert.equal(readPauseSetting(join(agentDir, "cliproxyapi.json")), false);
				assert.match(harness.notifications.at(-1)?.message ?? "", /resumed/i);
			});
		});
	});
});

test("startup reads a persisted pause and warns on a non-boolean value", async () => {
	const baseUrl = await closedPortBaseUrl();
	await withTempAgentDir(async (agentDir) => {
		writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
		writeFileSync(join(agentDir, "cliproxyapi.json"), JSON.stringify({ pause: "maybe" }));
		await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
			await captureWarnings(async (warnings) => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				assert.ok(warnings.some((warning) => /pause/.test(warning) && /boolean/.test(warning)));
				const [gate] = harness.handlers.get("before_provider_request") ?? [];
				assert.ok(gate);
				// Not paused: the gate resolves even though the file is invalid.
				await gate({ type: "before_provider_request", payload: {} }, harness.requestCtx("cliproxyapi"));
			});
		});
	});
});

// --- /fast

const fastCatalogModel: CodexCatalogModel = {
	...gpt56Sol,
	service_tiers: [{ id: "priority" }],
};
const fastModelsDevProviders = {
	openai: {
		models: {
			"gpt-5.6-sol": {
				cost: { input: 5, output: 30, cache_read: 0.5 },
				experimental: { modes: { fast: { cost: { input: 10, output: 60, cache_read: 1 } } } },
			},
		},
	},
};
const standardFastModelCost = { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 };
const priorityModelCost = { input: 10, output: 60, cacheRead: 1, cacheWrite: 0 };

function selectHarnessModel(harness: Harness, model: CodexCatalogModel = fastCatalogModel, provider = "cliproxyapi") {
	const mapped = toPiModel(model, buildCostCatalog(fastModelsDevProviders));
	assert.ok(mapped);
	const selected = { ...mapped, provider, api: "openai-responses", baseUrl: "http://example/v1" };
	Object.assign(harness.ctx, { model: selected });
	return selected;
}

test("readFastSetting defaults off and resolves environment values before the file", async () => {
	await withTempAgentDir(async (dir) => {
		const path = join(dir, "cliproxyapi.json");
		await withEnv({ CLIPROXYAPI_FAST: undefined }, async () => {
			assert.equal(readFastSetting(path), false);
			writeFileSync(path, JSON.stringify({ fast: true }));
			assert.equal(readFastSetting(path), true);
			writeFileSync(path, JSON.stringify({ fast: "yes" }));
			assert.throws(() => readFastSetting(path), /field "fast" must be a boolean/);
			for (const value of ["true", "1", "yes", "ON", " true "]) {
				assert.equal(readFastSetting(path, value), true);
			}
			for (const value of ["false", "0", "no", "OFF", " false "]) {
				assert.equal(readFastSetting(path, value), false);
			}
			assert.throws(() => readFastSetting(path, "maybe"), /CLIPROXYAPI_FAST/);
		});
	});
});

test("saveFastSetting and savePauseSetting preserve each other's flags and unrelated settings", async () => {
	await withTempAgentDir(async (dir) => {
		const path = join(dir, "nested", "cliproxyapi.json");
		saveFastSetting(path, true);
		savePauseSetting(path, true);
		writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), custom: "keep" }));
		saveFastSetting(path, false);
		assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { fast: false, pause: true, custom: "keep" });
	});
});

test("Fast and pause writes refuse to overwrite malformed configuration", async () => {
	await withTempAgentDir(async (dir) => {
		const path = join(dir, "cliproxyapi.json");
		for (const content of ["{", "[]", "null"]) {
			writeFileSync(path, content);
			assert.throws(() => saveFastSetting(path, true));
			assert.equal(readFileSync(path, "utf8"), content);
			assert.throws(() => savePauseSetting(path, true));
			assert.equal(readFileSync(path, "utf8"), content);
		}
	});
});

test("matchModelCost uses published Fast rates and falls back to standard rates", () => {
	const catalog = buildCostCatalog(fastModelsDevProviders);
	assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog), standardFastModelCost);
	assert.deepEqual(matchModelCost("gpt-5.6-sol", catalog, true), priorityModelCost);
	assert.deepEqual(matchModelCost("gpt-5.4-mini", buildCostCatalog(modelsDevProviders), true),
		matchModelCost("gpt-5.4-mini", buildCostCatalog(modelsDevProviders)));
});

test("/fast persists toggles, updates pricing and status, and changes only supported request payloads", async () => {
	await withCatalogServer(() => ({ status: 200, body: { models: [fastCatalogModel, gpt54Mini] } }),
		async (baseUrl, requests) => {
			await withTempAgentDir(async (agentDir) => {
				writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
				await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
					const harness = createHarness();
					await cliproxyapi(harness.pi);
					const selected = selectHarnessModel(harness);
					const fast = harness.commands.get("fast");
					const [request] = harness.handlers.get("before_provider_request") ?? [];
					assert.ok(fast && request);
					const payload = { model: selected.id, input: [], reasoning: { effort: "high" } };
					assert.equal(await request({ payload }, harness.ctx), undefined);
					await fast("on", harness.ctx);
					assert.equal(harness.notifications.at(-1)?.type, "error");
					assert.equal(readFastSetting(join(agentDir, "cliproxyapi.json")), false);
					await fast("", harness.ctx);
					assert.equal(readFastSetting(join(agentDir, "cliproxyapi.json")), true);
					assert.equal(harness.statuses.get("cliproxyapi-fast"), "fast");
					assert.deepEqual(await request({ payload }, harness.ctx), { ...payload, service_tier: "priority" });
					assert.equal("service_tier" in payload, false);
					assert.deepEqual(selected.cost, priorityModelCost);
					assert.deepEqual(harness.providers.at(-1)?.config.models?.[0]?.cost, priorityModelCost);
					assert.deepEqual(harness.providers.at(-1)?.config.models?.[1]?.cost, zeroCost);
					assert.equal(await request({ payload }, harness.requestCtx("anthropic")), undefined);
					const mini = selectHarnessModel(harness, gpt54Mini);
					for (const handler of harness.handlers.get("model_select") ?? []) await handler({ model: mini }, harness.ctx);
					assert.equal(harness.statuses.get("cliproxyapi-fast"), undefined);
					assert.equal(await request({ payload: { model: mini.id } }, harness.ctx), undefined);
					selectHarnessModel(harness);
					await fast("", harness.ctx);
					assert.equal(readFastSetting(join(agentDir, "cliproxyapi.json")), false);
					assert.equal(harness.statuses.get("cliproxyapi-fast"), undefined);
					assert.deepEqual(harness.ctx.model?.cost, standardFastModelCost);
					assert.equal(await request({ payload }, harness.ctx), undefined);
					assert.equal(requests.length, 1, "toggles must not depend on a network refresh");
					const cache = JSON.parse(readFileSync(join(agentDir, "cliproxyapi-models.json"), "utf8"));
					assert.deepEqual(cache.fastModelIds, [selected.id]);
					assert.deepEqual(cache.models[0].cost, standardFastModelCost);
				});
			});
		});
});

test("/fast warns for unsupported models and does not guess support from additional_speed_tiers", async () => {
	const unsupported = { ...gpt56Sol, additional_speed_tiers: ["fast"], service_tiers: [] };
	await withCatalogServer(() => ({ status: 200, body: { models: [unsupported] } }), async (baseUrl) => {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				selectHarnessModel(harness);
				await harness.commands.get("fast")!("", harness.ctx);
				assert.equal(readFastSetting(join(agentDir, "cliproxyapi.json")), true);
				assert.equal(harness.notifications.at(-1)?.type, "warning");
				assert.match(harness.notifications.at(-1)?.message ?? "", /does not support/);
				assert.equal(harness.statuses.get("cliproxyapi-fast"), undefined);
				const [request] = harness.handlers.get("before_provider_request") ?? [];
				assert.equal(await request!({ payload: { model: fastCatalogModel.slug } }, harness.ctx), undefined);
				assert.deepEqual(harness.ctx.model?.cost, standardFastModelCost);
			});
		});
	});
});

test("persisted Fast capability works from cache offline and defaults unknown capability off", async () => {
	const baseUrl = await closedPortBaseUrl();
	for (const fastModelIds of [[fastCatalogModel.slug!], undefined, [123], ["unknown"]]) {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			writeFileSync(join(agentDir, "cliproxyapi.json"), JSON.stringify({ fast: true }));
			writeFileSync(join(agentDir, "cliproxyapi-models.json"), JSON.stringify({
				version: 2, modelsUrl: `${baseUrl}/v1/models?client_version=pi`, fetchedAt: 1,
				models: [toPiModel(fastCatalogModel, buildCostCatalog(fastModelsDevProviders))], fastModelIds,
			}));
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				await captureWarnings(async (warnings) => {
					const harness = createHarness();
					await cliproxyapi(harness.pi);
					selectHarnessModel(harness);
					for (const handler of harness.handlers.get("session_start") ?? []) await handler({}, harness.ctx);
					const supported = fastModelIds?.[0] === fastCatalogModel.slug;
					assert.equal(harness.statuses.get("cliproxyapi-fast"), supported ? "fast" : undefined);
					assert.deepEqual(harness.providers[0]?.config.models?.[0]?.cost, supported ? priorityModelCost : standardFastModelCost);
					const [request] = harness.handlers.get("before_provider_request") ?? [];
					assert.deepEqual(await request!({ payload: { model: fastCatalogModel.slug } }, harness.ctx),
						supported ? { model: fastCatalogModel.slug, service_tier: "priority" } : undefined);
					await waitFor(() => warnings.length > 0);
				});
			});
		});
	}
});

test("Fast-only pricing disagreements do not erase identical standard prices", () => {
	const standard = { input: 5, output: 30, cache_read: 0.5 };
	const catalog = buildCostCatalog({
		"reseller-a": { models: { "other-model": { cost: standard } } },
		"reseller-b": { models: { "other-model": {
			cost: standard,
			experimental: { modes: { fast: { cost: { input: 10, output: 60 } } } },
		} } },
	});
	assert.deepEqual(matchModelCost("other-model", catalog), standardFastModelCost);
	assert.deepEqual(matchModelCost("other-model", catalog, true), standardFastModelCost);
});

test("an active model removed from the catalog returns to standard prices", async () => {
	let models = [fastCatalogModel];
	await withCatalogServer(() => ({ status: 200, body: { models } }), async (baseUrl) => {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				const selected = selectHarnessModel(harness);
				await harness.commands.get("fast")!("", harness.ctx);
				assert.deepEqual(selected.cost, priorityModelCost);
				models = [];
				await harness.commands.get("cliproxyapi-refresh")!("", harness.ctx);
				assert.equal(harness.statuses.get("cliproxyapi-fast"), undefined);
				assert.deepEqual(selected.cost, standardFastModelCost);
				await harness.commands.get("fast")!("", harness.ctx);
				assert.deepEqual(selected.cost, standardFastModelCost);
			});
		});
	});
});

test("stock Responses streaming applies published Fast prices exactly once", async () => {
	await withCatalogServer(() => ({ status: 200, body: { models: [fastCatalogModel] } }), async (baseUrl) => {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				const selected = selectHarnessModel(harness);
				await harness.commands.get("fast")!("", harness.ctx);
				const config = harness.providers.at(-1)!.config;
				assert.ok(config.streamSimple);
				for (const serviceTier of ["priority", "fast", undefined, "default", "flex"]) {
					const event = { type: "response.completed", response: {
						id: "resp_pricing", status: "completed", service_tier: serviceTier, output: [],
						usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, total_tokens: 2_000_000 },
					} };
					const observed: string[] = [];
					const stream = config.streamSimple(selected, normalizeContext({ messages: [{ role: "user", content: "test", timestamp: 0 }] }), {
						apiKey: "smoke-only",
						fetch: async () => new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { "content-type": "text/event-stream" } }),
						onPayload: (payload) => ({ ...(payload as Record<string, unknown>), service_tier: "priority" }),
						onResponse: () => { observed.push("response"); },
						onProviderStreamEvent: () => { observed.push("stream"); },
					});
					const message = await stream.result();
					assert.equal(message.stopReason, "stop", message.errorMessage);
					assert.equal(message.usage.cost.total, serviceTier === "flex" ? 17.5 : serviceTier === "default" ? 35 : 70);
					assert.deepEqual(observed, ["response", "stream"]);
				}
			});
		});
	});
});

test("catalog refresh updates active Fast capability, status, and pricing", async () => {
	let supported = false;
	await withCatalogServer(() => ({ status: 200, body: { models: [
		{ ...fastCatalogModel, service_tiers: supported ? ["priority"] : [] },
	] } }), async (baseUrl) => {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			writeFileSync(join(agentDir, "cliproxyapi.json"), JSON.stringify({ fast: true }));
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				const selected = selectHarnessModel(harness);
				for (const handler of harness.handlers.get("session_start") ?? []) await handler({}, harness.ctx);
				const refresh = harness.commands.get("cliproxyapi-refresh")!;
				const [request] = harness.handlers.get("before_provider_request") ?? [];
				for (const capability of [true, false]) {
					supported = capability;
					await refresh("", harness.ctx);
					assert.equal(harness.statuses.get("cliproxyapi-fast"), capability ? "fast" : undefined);
					assert.deepEqual(selected.cost, capability ? priorityModelCost : standardFastModelCost);
					assert.deepEqual(await request!({ payload: { model: selected.id } }, harness.ctx),
						capability ? { model: selected.id, service_tier: "priority" } : undefined);
				}
			});
		});
	});
});

test("a paused request uses the Fast preference at release time", async () => {
	await withCatalogServer(() => ({ status: 200, body: { models: [fastCatalogModel] } }), async (baseUrl) => {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				selectHarnessModel(harness);
				await harness.commands.get("pause")!("", harness.ctx);
				const [request] = harness.handlers.get("before_provider_request") ?? [];
				const waiting = request!({ payload: { model: fastCatalogModel.slug } }, harness.ctx);
				await harness.commands.get("fast")!("", harness.ctx);
				await harness.commands.get("continue")!("", harness.ctx);
				assert.deepEqual(await waiting, { model: fastCatalogModel.slug, service_tier: "priority" });
			});
		});
	});
});

test("a failed /fast config write leaves request behavior, status, and pricing unchanged", async () => {
	await withCatalogServer(() => ({ status: 200, body: { models: [fastCatalogModel] } }), async (baseUrl) => {
		await withTempAgentDir(async (agentDir) => {
			writeFreshModelsDevCache(agentDir, fastModelsDevProviders);
			await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_FAST: undefined }, async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				selectHarnessModel(harness);
				mkdirSync(join(agentDir, "cliproxyapi.json"));
				await harness.commands.get("fast")!("", harness.ctx);
				assert.equal(harness.notifications.at(-1)?.type, "error");
				assert.equal(harness.statuses.get("cliproxyapi-fast"), undefined);
				assert.deepEqual(harness.ctx.model?.cost, standardFastModelCost);
				const [request] = harness.handlers.get("before_provider_request") ?? [];
				assert.equal(await request!({ payload: {} }, harness.ctx), undefined);
			});
		});
	});
});

// --- transient stream error normalization (T4)

function assistantMessage(overrides: Partial<AssistantMessage>): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "openai-responses",
		provider: "cliproxyapi",
		model: "gpt-5.6-sol",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
		stopReason: "error",
		errorMessage: "stream disconnected before completion: stream closed before response.completed",
		timestamp: 0,
		...overrides,
	} as AssistantMessage;
}

test("normalizeTransientNetworkError prefixes a matching cliproxyapi stream error", () => {
	for (const errorMessage of [
		"stream disconnected before completion: stream closed before response.completed",
		"use of closed network connection",
		"Invalid SSE data JSON: unexpected end of input",
	]) {
		const message = assistantMessage({ errorMessage });
		const normalized = normalizeTransientNetworkError(message);
		assert.notEqual(normalized, message);
		assert.equal(normalized.errorMessage, `network error: ${errorMessage}`);
		assert.deepEqual({ ...normalized, errorMessage: undefined }, { ...message, errorMessage: undefined });
	}
});

test("normalizeTransientNetworkError leaves already retryable, foreign, and non-error messages alone", () => {
	const retryable = assistantMessage({ errorMessage: "503 Service Unavailable: closed network connection" });
	assert.equal(normalizeTransientNetworkError(retryable), retryable);

	const foreign = assistantMessage({ provider: "openai" });
	assert.equal(normalizeTransientNetworkError(foreign), foreign);

	const stopped = assistantMessage({ stopReason: "stop", errorMessage: undefined });
	assert.equal(normalizeTransientNetworkError(stopped), stopped);

	const unrelated = assistantMessage({ errorMessage: "invalid_request_error: bad prompt" });
	assert.equal(normalizeTransientNetworkError(unrelated), unrelated);
});

test("message_end returns a replacement only when the message changed", async () => {
	const baseUrl = await closedPortBaseUrl();
	await withTempAgentDir(async (agentDir) => {
		writeFreshModelsDevCache(agentDir, emptyModelsDevProviders);
		await withEnv({ PI_CODING_AGENT_DIR: agentDir, CLIPROXYAPI_BASE_URL: baseUrl }, async () => {
			await captureWarnings(async () => {
				const harness = createHarness();
				await cliproxyapi(harness.pi);
				const [onMessageEnd] = harness.handlers.get("message_end") ?? [];
				assert.ok(onMessageEnd);

				const matching = assistantMessage({});
				const result = (await onMessageEnd({ type: "message_end", message: matching }, harness.ctx)) as
					| { message: AssistantMessage }
					| undefined;
				assert.equal(result?.message.errorMessage, `network error: ${matching.errorMessage}`);

				assert.equal(
					await onMessageEnd({ type: "message_end", message: assistantMessage({ provider: "openai" }) }, harness.ctx),
					undefined,
				);
				assert.equal(
					await onMessageEnd(
						{ type: "message_end", message: { role: "user", content: "hi", timestamp: 0 } },
						harness.ctx,
					),
					undefined,
				);
			});
		});
	});
});
