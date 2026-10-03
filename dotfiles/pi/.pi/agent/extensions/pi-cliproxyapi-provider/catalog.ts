import { readFileSync } from "node:fs";
import type { ThinkingLevelMap } from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { asRecord, BASE_URL_ENV_VAR, errorMessage, logWarn, positiveNumber, writeTextFile, ZERO_COST } from "./shared.ts";
import { matchModelCost, type CostCatalog } from "./pricing.ts";

export type ProviderChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

const DEFAULT_BASE_URL = "http://127.0.0.1:8317";

const CLIENT_VERSION = "pi";

export const MODELS_CACHE_FILE_NAME = "cliproxyapi-models.json";

const MODELS_CACHE_VERSION = 2;

const LEGACY_MODELS_CACHE_VERSION = 1;

const DEFAULT_CONTEXT_WINDOW = 128000;

// The Codex catalog has no output limit field. The proxy's management catalog
// reports 128000 for every Codex text model. pi only reads this for
// output-length recovery detection; it is not sent as max_output_tokens.
const MAX_TOKENS = 128000;

const PI_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type CodexCatalogModel = {
  slug?: string;
  display_name?: string;
  description?: string;
  context_window?: number;
  max_context_window?: number;
  input_modalities?: string[];
  supported_reasoning_levels?: Array<{ effort?: string; description?: string } | string>;
  apply_patch_tool_type?: unknown;
  visibility?: string;
  service_tiers?: unknown;
};

export type Endpoints = {
  inferenceBaseUrl: string;
  modelsUrl: string;
};

export type ModelsCache = {
  version: typeof MODELS_CACHE_VERSION;
  modelsUrl: string;
  fetchedAt: number;
  models: ProviderChatModelConfig[];
  // Older version 2 caches omit this field and cannot verify Fast support.
  fastModelIds?: string[];
};

/**
 * Derive the inference base URL and the catalog URL from the configured root.
 * `http://host:port`, `http://host:port/`, and `http://host:port/v1` all
 * resolve to the same endpoints.
 */
export function resolveEndpoints(baseUrlInput: string | undefined): Endpoints {
  let raw = (baseUrlInput ?? "").trim() || DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error(`invalid ${BASE_URL_ENV_VAR}: ${errorMessage(error)}`, { cause: error });
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  const root = `${url.origin}${path}`;
  return {
    inferenceBaseUrl: `${root}/v1`,
    modelsUrl: `${root}/v1/models?client_version=${encodeURIComponent(CLIENT_VERSION)}`,
  };
}

/** Fetch the Codex catalog. Throws on a non-2xx status or an unexpected shape. */

export async function fetchCodexModels(
  modelsUrl: string,
  apiKey: string | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CodexCatalogModel[]> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(modelsUrl, {
    headers,
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });
  if (!response.ok) {
    throw new Error(`models request failed: ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  if (Array.isArray(payload)) return payload as CodexCatalogModel[];
  if (payload && typeof payload === "object") {
    const { models, data } = payload as { models?: unknown; data?: unknown };
    if (Array.isArray(models)) return models as CodexCatalogModel[];
    if (Array.isArray(data)) return data as CodexCatalogModel[];
  }
  throw new Error("models request returned an unexpected payload shape");
}

function extractReasoningEfforts(model: CodexCatalogModel): string[] {
  const efforts: string[] = [];
  for (const entry of model.supported_reasoning_levels ?? []) {
    const effort = typeof entry === "string" ? entry : entry?.effort;
    const normalized = (effort ?? "").trim().toLowerCase();
    if (normalized && !efforts.includes(normalized)) efforts.push(normalized);
  }
  return efforts;
}

/**
 * Map catalog efforts onto pi thinking levels. `off` maps to `none` only when
 * the catalog lists it. Levels the catalog does not list are `null`
 * (unsupported). Efforts with no pi level, such as `ultra`, are ignored.
 */
function buildThinkingLevelMap(efforts: string[]): ThinkingLevelMap | undefined {
  if (efforts.length === 0) return undefined;
  const supported = new Set(efforts);
  const map: ThinkingLevelMap = {};
  for (const level of PI_THINKING_LEVELS) {
    if (level === "off") {
      map.off = supported.has("none") ? "none" : null;
    } else {
      map[level] = supported.has(level) ? level : null;
    }
  }
  return map;
}

function buildInputModalities(model: CodexCatalogModel): Array<"text" | "image"> {
  const input: Array<"text" | "image"> = [];
  for (const modality of model.input_modalities ?? []) {
    const value = String(modality).trim().toLowerCase();
    if ((value === "text" || value === "image") && !input.includes(value)) {
      input.push(value);
    }
  }
  if (!input.includes("text")) input.unshift("text");
  return input;
}

export function toPiModel(
  model: CodexCatalogModel,
  costCatalog?: CostCatalog,
): ProviderChatModelConfig | null {
  const id = (model.slug ?? "").trim();
  if (!id) return null;
  if (String(model.visibility ?? "").toLowerCase() === "hide") return null;

  const efforts = extractReasoningEfforts(model);
  const thinkingLevelMap = buildThinkingLevelMap(efforts);
  return {
    id,
    name: (model.display_name ?? "").trim() || id,
    reasoning: efforts.some((effort) => effort !== "none"),
    input: buildInputModalities(model),
    cost: costCatalog ? matchModelCost(id, costCatalog) : { ...ZERO_COST },
    contextWindow:
      positiveNumber(model.context_window) ??
      positiveNumber(model.max_context_window) ??
      DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_TOKENS,
    ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
    // Read by pi-cache-optimizer and pi's openai-responses transport. The
    // proxy runs routing.session-affinity: true, so it prefers the same
    // upstream account while available. Long cache retention is safe while only Codex
    // upstreams are authed.
    compat: {
      sessionAffinityFormat: "openai",
      supportsLongCacheRetention: true,
      supportsOpenAIGrammarTools:
        typeof model.apply_patch_tool_type === "string" &&
        model.apply_patch_tool_type.trim().toLowerCase() === "freeform",
    },
  };
}

function isProviderModel(value: unknown): value is ProviderChatModelConfig {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<ProviderChatModelConfig>;
  return (
    (model.type === undefined || model.type === "chat") &&
    typeof model.id === "string" &&
    typeof model.name === "string" &&
    typeof model.reasoning === "boolean" &&
    Array.isArray(model.input) &&
    model.input.every((modality) => typeof modality === "string") &&
    typeof model.contextWindow === "number" &&
    typeof model.maxTokens === "number" &&
    !!model.cost &&
    typeof model.cost === "object"
  );
}

function parseCacheVersion(
  raw: unknown,
  modelsUrl: string,
  version: number,
): ProviderChatModelConfig[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cache = raw as Partial<ModelsCache> & { version?: unknown };
  if (cache.version !== version) return null;
  if (cache.modelsUrl !== modelsUrl) return null;
  if (typeof cache.fetchedAt !== "number") return null;
  if (!Array.isArray(cache.models) || !cache.models.every(isProviderModel)) return null;
  return cache.models;
}

function hasGrammarCapability(model: ProviderChatModelConfig): boolean {
  const compat = asRecord(model.compat);
  return typeof compat?.supportsOpenAIGrammarTools === "boolean";
}

/** Validate a current cache file. Rejects legacy versions and other catalog URLs. */

export function parseModelsCache(raw: unknown, modelsUrl: string): ProviderChatModelConfig[] | null {
  const models = parseCacheVersion(raw, modelsUrl, MODELS_CACHE_VERSION);
  return models?.every(hasGrammarCapability) ? models : null;
}

/** Read a version 1 cache while forcing unverified grammar capability off. */

export function parseLegacyModelsCache(
  raw: unknown,
  modelsUrl: string,
): ProviderChatModelConfig[] | null {
  const models = parseCacheVersion(raw, modelsUrl, LEGACY_MODELS_CACHE_VERSION);
  if (!models) return null;
  return models.map((model) => ({
    ...model,
    compat: {
      ...(asRecord(model.compat) ?? {}),
      supportsOpenAIGrammarTools: false,
    },
  }));
}

type CachedModels =
  | { kind: "current"; models: ProviderChatModelConfig[]; fastModelIds: string[] }
  | { kind: "legacy"; models: ProviderChatModelConfig[] }
  | { kind: "none" };

export function readModelsCache(cachePath: string, modelsUrl: string): CachedModels {
  let text: string;
  try {
    text = readFileSync(cachePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logWarn(`failed to read ${cachePath}: ${errorMessage(error)}`);
    }
    return { kind: "none" };
  }
  try {
    const raw = JSON.parse(text);
    const current = parseModelsCache(raw, modelsUrl);
    if (current) {
      const ids = asRecord(raw)?.fastModelIds;
      const knownIds = new Set(current.map((model) => model.id));
      const fastModelIds = Array.isArray(ids) && ids.every((id) => typeof id === "string")
        ? ids.map((id: string) => id.trim()).filter((id: string) => knownIds.has(id))
        : [];
      return { kind: "current", models: current, fastModelIds };
    }
    const legacy = parseLegacyModelsCache(raw, modelsUrl);
    if (legacy) return { kind: "legacy", models: legacy };
    return { kind: "none" };
  } catch (error) {
    logWarn(`ignoring invalid ${cachePath}: ${errorMessage(error)}`);
    return { kind: "none" };
  }
}

export function writeModelsCache(
  cachePath: string,
  modelsUrl: string,
  models: ProviderChatModelConfig[],
  fastModelIds: string[],
): void {
  const cache: ModelsCache = {
    version: MODELS_CACHE_VERSION,
    modelsUrl,
    fetchedAt: Date.now(),
    models,
    fastModelIds,
  };
  writeTextFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

// --- pause gate

/** Read `cliproxyapi.json`. A missing file is `{}`. Throws on invalid content. */
