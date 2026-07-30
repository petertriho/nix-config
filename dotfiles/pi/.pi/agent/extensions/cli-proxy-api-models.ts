/**
 * CLIProxyAPI model discovery for pi.
 *
 * Registers a separate `cli-proxy-api` provider whose models are discovered
 * from the proxy. Native pi providers stay untouched. Discovery is bounded
 * (short timeout), cached under the XDG cache directory, and falls back to
 * stale cache data so a stopped proxy never prevents pi from starting with its
 * native providers.
 *
 * Model availability comes from the proxy's OpenAI-compatible /v1/models
 * endpoint (filtered by active auth). Rich per-model metadata (display name,
 * context window, max output tokens, reasoning support) is pulled from the
 * proxy's management catalog at /v0/management/model-definitions/:channel and
 * merged by model ID. When the catalog is unreachable or lacks a model, fields
 * fall back to conservative heuristics so discovery always yields usable models.
 *
 * Configuration via environment variables:
 *   CLI_PROXY_API_KEY                  API key sent to the proxy (shared with other clients)
 *   PI_CLI_PROXY_BASE_URL              Override http://127.0.0.1:8317/v1
 *   PI_CLI_PROXY_MODELS_CACHE_DAYS     Cache freshness window (default: 7)
 *   PI_CLI_PROXY_MODELS_TIMEOUT_MS     Discovery fetch timeout (default: 5000)
 *   PI_CLI_PROXY_MODELS_FORCE_REFRESH  Set to "1" to bypass the fresh cache
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTENSION_NAME = "cli-proxy-api-models";
const PROVIDER_ID = "cli-proxy-api";
const PROVIDER_NAME = "CLIProxyAPI";
const API_KEY_ENV_VAR = "CLI_PROXY_API_KEY";
const DEFAULT_BASE_URL = "http://127.0.0.1:8317/v1";
const DEFAULT_CACHE_DAYS = 7;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 16384;

// Channels exposed by the proxy management catalog. Models are unioned across
// channels; the first occurrence of an ID wins (IDs are provider-scoped).
const MODEL_DEFINITION_CHANNELS = [
	"codex",
	"claude",
	"gemini",
	"vertex",
	"aistudio",
	"kimi",
	"antigravity",
	"xai",
] as const;

// Heuristic reasoning signal used only when the catalog has no `thinking` block.
const REASONING_PATTERN = /(thinking|reasoning|gpt-oss|^o[134](?:-|$)|^gpt-5)/i;

type CatalogModel = {
	id?: string;
	display_name?: string;
	name?: string;
	context_length?: number;
	inputTokenLimit?: number;
	max_completion_tokens?: number;
	outputTokenLimit?: number;
	thinking?: { levels?: unknown[]; min?: number; max?: number } | null;
};

type ResolvedModel = {
	id: string;
	name: string;
	reasoning: boolean;
	contextWindow: number;
	maxTokens: number;
};

function numberFromEnv(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveNumber(value: number | undefined, fallback: number): number {
	return typeof value === "number" && value > 0 ? value : fallback;
}

function cachePath(): string {
	const root = process.env.XDG_CACHE_HOME || join(process.env.HOME || ".", ".cache");
	return join(root, "pi", `${EXTENSION_NAME}.json`);
}

function normalizeModelsURL(baseURL: string): string {
	const url = new URL(baseURL);
	url.pathname = url.pathname.replace(/\/$/, "") + "/models";
	url.search = "";
	url.hash = "";
	return url.toString();
}

// The management API lives next to /v1 on the same origin (/v0/...). Strip a
// trailing /v1 from the configured base so reverse-proxied mounts still work.
function managementURL(baseURL: string, channel: string): string {
	const url = new URL(baseURL);
	const base = url.pathname.replace(/\/v1\/?$/, "");
	const resource = `/v0/management/model-definitions/${encodeURIComponent(channel)}`;
	url.pathname = (base + resource).replace(/\/{2,}/g, "/");
	url.search = "";
	url.hash = "";
	return url.toString();
}

function isResolvedModel(value: unknown): value is ResolvedModel {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as ResolvedModel).id === "string" &&
		typeof (value as ResolvedModel).name === "string" &&
		typeof (value as ResolvedModel).reasoning === "boolean" &&
		typeof (value as ResolvedModel).contextWindow === "number" &&
		typeof (value as ResolvedModel).maxTokens === "number"
	);
}

function readCache(path: string, maxAgeMs: number): ResolvedModel[] | { stale: ResolvedModel[] } | null {
	if (!existsSync(path)) return null;

	try {
		const cache = JSON.parse(readFileSync(path, "utf8"));
		if (!Array.isArray(cache?.models) || typeof cache.updatedAt !== "number") return null;

		// Reject legacy caches (models stored as bare id strings) or otherwise
		// malformed entries so discovery re-fetches instead of casting them.
		const models = cache.models.filter(isResolvedModel);
		if (models.length === 0) return null;

		const age = Date.now() - cache.updatedAt;
		if (age >= 0 && age < maxAgeMs) return models;
		return { stale: models };
	} catch (error) {
		console.warn(`[${EXTENSION_NAME}] Failed to read cache: ${(error as Error).message}`);
		return null;
	}
}

function writeCache(path: string, models: ResolvedModel[]): void {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify({ updatedAt: Date.now(), models }, null, 2) + "\n");
	} catch (error) {
		console.warn(`[${EXTENSION_NAME}] Failed to write cache: ${(error as Error).message}`);
	}
}

async function fetchJSON(url: string, apiKey: string | undefined, timeoutMs: number): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const headers: Record<string, string> = {};
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

		const response = await fetch(url, {
			headers,
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

		return await response.json();
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchLiveModelIds(modelsURL: string, apiKey: string | undefined, timeoutMs: number): Promise<string[]> {
	const body = await fetchJSON(modelsURL, apiKey, timeoutMs);
	if (!body || !Array.isArray((body as { data?: unknown }).data)) {
		throw new Error("response did not include a data array");
	}

	return (body as { data: unknown[] }).data
		.map((model: unknown) =>
			model && typeof (model as { id?: unknown }).id === "string" ? (model as { id: string }).id : null,
		)
		.filter((id: string | null): id is string => id !== null)
		.filter((id: string, index: number, ids: string[]) => ids.indexOf(id) === index)
		.sort();
}

async function fetchCatalog(
	baseURL: string,
	apiKey: string | undefined,
	timeoutMs: number,
): Promise<Map<string, CatalogModel>> {
	const responses = await Promise.all(
		MODEL_DEFINITION_CHANNELS.map(async (channel) => {
			try {
				return await fetchJSON(managementURL(baseURL, channel), apiKey, timeoutMs);
			} catch {
				// A missing/disabled channel or transient error must not abort
				// discovery; metadata simply falls back to heuristics.
				return null;
			}
		}),
	);

	const catalog = new Map<string, CatalogModel>();
	for (const body of responses) {
		const models = (body as { models?: unknown } | null)?.models;
		if (!Array.isArray(models)) continue;
		for (const model of models) {
			if (!model || typeof (model as CatalogModel).id !== "string") continue;
			const id = (model as CatalogModel).id as string;
			if (!catalog.has(id)) catalog.set(id, model as CatalogModel);
		}
	}
	return catalog;
}

function resolveModel(id: string, meta: CatalogModel | undefined): ResolvedModel {
	const contextWindow = positiveNumber(
		meta?.context_length,
		positiveNumber(meta?.inputTokenLimit, DEFAULT_CONTEXT_WINDOW),
	);
	const maxTokens = positiveNumber(
		meta?.max_completion_tokens,
		positiveNumber(meta?.outputTokenLimit, DEFAULT_MAX_TOKENS),
	);
	const reasoning = meta && meta.thinking ? true : REASONING_PATTERN.test(id);
	const name = meta?.display_name || meta?.name || id;

	return { id, name, reasoning, contextWindow, maxTokens };
}

function isChatModel(id: string): boolean {
	return !/(^|[-_/])(embedding|embed|rerank|image)([-_/]|$)/i.test(id);
}

function modelEntry(model: ResolvedModel) {
	return {
		id: model.id,
		name: model.name,
		reasoning: model.reasoning,
		input: ["text" as const],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
	};
}

async function loadModels(baseURL: string): Promise<ResolvedModel[]> {
	const path = cachePath();
	const cacheDays = numberFromEnv("PI_CLI_PROXY_MODELS_CACHE_DAYS", DEFAULT_CACHE_DAYS);
	const timeoutMs = numberFromEnv("PI_CLI_PROXY_MODELS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
	const maxAgeMs = cacheDays * 24 * 60 * 60 * 1000;
	const cached = process.env.PI_CLI_PROXY_MODELS_FORCE_REFRESH === "1" ? null : readCache(path, maxAgeMs);

	if (Array.isArray(cached)) return cached;

	try {
		const ids = await fetchLiveModelIds(normalizeModelsURL(baseURL), process.env[API_KEY_ENV_VAR], timeoutMs);
		const catalog = await fetchCatalog(baseURL, process.env[API_KEY_ENV_VAR], timeoutMs);
		const resolved = ids.map((id) => resolveModel(id, catalog.get(id)));
		writeCache(path, resolved);
		return resolved;
	} catch (error) {
		const stale = cached && !Array.isArray(cached) && Array.isArray(cached.stale) ? cached.stale : [];
		const suffix = stale.length > 0 ? `; using ${stale.length} stale cached models` : "";
		console.warn(`[${EXTENSION_NAME}] Model discovery failed: ${(error as Error).message}${suffix}`);
		return stale;
	}
}

export default async function (pi: ExtensionAPI) {
	const baseUrl = process.env.PI_CLI_PROXY_BASE_URL || DEFAULT_BASE_URL;
	const discovered = await loadModels(baseUrl);
	const models = discovered.filter((model) => isChatModel(model.id)).map(modelEntry);

	// Skip registration entirely when the proxy is unreachable and no cache
	// exists, leaving all native pi providers usable.
	if (models.length === 0) return;

	pi.registerProvider(PROVIDER_ID, {
		name: PROVIDER_NAME,
		baseUrl,
		// Resolved by pi from the environment at request time; the key is
		// never written into any generated file.
		apiKey: `$${API_KEY_ENV_VAR}`,
		api: "openai-completions",
		models,
	});
}
