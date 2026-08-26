/**
 * CLIProxyAPI provider for pi.
 *
 * Registers the `cliproxyapi` provider with models discovered from the proxy's
 * Codex catalog (`/v1/models?client_version=pi`) and served over pi's stock
 * `openai-responses` API at `${root}/v1`. Native pi providers stay untouched.
 *
 * Startup is cache-first: a valid `~/.pi/agent/cliproxyapi-models.json`
 * registers at once and refreshes in the background. Without a cache, the
 * catalog is fetched synchronously with a short timeout. When both fail, a
 * warning is logged and no models are registered.
 *
 * Prices come from https://models.dev/api.json, cached for 24 h at
 * `~/.pi/agent/tmp/models-dev-cache.json` with a stale fallback. Models that
 * models.dev does not price unambiguously get zero cost.
 *
 * Environment:
 *   CLIPROXYAPI_BASE_URL  Proxy root, default http://127.0.0.1:8317.
 *                         A trailing `/` or `/v1` is stripped.
 *   CLIPROXYAPI_API_KEY   Bearer token for the catalog request. pi resolves
 *                         the same variable at inference time.
 *
 * Commands:
 *   /cliproxyapi-refresh  Fetch the catalog again and rewrite the cache.
 *   /pause, /continue     Hold or release `cliproxyapi` requests. The flag is
 *                         persisted in `~/.pi/agent/cliproxyapi.json` and
 *                         polled, so `/continue` in another pi instance also
 *                         releases a waiting request.
 *
 * Stream drops the proxy reports with wording pi does not recognise as
 * retryable are prefixed with `network error:` on `message_end`, so pi's
 * retry policy takes the turn again.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AssistantMessage,
  type ModelCost,
  type ModelCostRates,
  type ModelCostTier,
  type ThinkingLevelMap,
  isRetryableAssistantError,
} from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ProviderModelConfig,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const EXTENSION_NAME = "pi-cliproxyapi-provider";
const PROVIDER_ID = "cliproxyapi";
const PROVIDER_NAME = "CLIProxyAPI";
const BASE_URL_ENV_VAR = "CLIPROXYAPI_BASE_URL";
const API_KEY_ENV_VAR = "CLIPROXYAPI_API_KEY";
const DEFAULT_BASE_URL = "http://127.0.0.1:8317";
const CLIENT_VERSION = "pi";
const MODELS_CACHE_FILE_NAME = "cliproxyapi-models.json";
const MODELS_CACHE_VERSION = 1;
const CONFIG_FILE_NAME = "cliproxyapi.json";
const PAUSE_POLL_INTERVAL_MS = 200;
const PAUSE_STATUS_KEY = "cliproxyapi";
// Proxy stream failures that pi-ai's retry pattern does not cover.
const TRANSIENT_STREAM_ERROR_PATTERN =
  /closed network connection|stream disconnected before completion: stream closed before response\.completed|invalid SSE data JSON/i;
const NETWORK_ERROR_PREFIX = "network error: ";
const MODELS_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CONTEXT_WINDOW = 128000;
// The Codex catalog has no output limit field. The proxy's management catalog
// reports 128000 for every Codex text model. pi only reads this for
// output-length recovery detection; it is not sent as max_output_tokens.
const MAX_TOKENS = 128000;

const MODELS_DEV_URL = "https://models.dev/api.json";
const MODELS_DEV_TIMEOUT_MS = 3_000;
const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MODELS_DEV_CACHE_FILE = join("tmp", "models-dev-cache.json");
// For these ids, first-party prices win over reseller entries.
const OPENAI_MODEL_PATTERN = /^(?:gpt-|o[134](?:-|$)|codex-)/;
const OPENAI_PROVIDER_PREFERENCE = ["openai", "openai-codex", "opencode"];

const PI_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const ZERO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Subset of a `/v1/models?client_version=pi` catalog entry that is mapped. */
export type CodexCatalogModel = {
  slug?: string;
  display_name?: string;
  description?: string;
  context_window?: number;
  max_context_window?: number;
  input_modalities?: string[];
  supported_reasoning_levels?: Array<{ effort?: string; description?: string } | string>;
  visibility?: string;
};

export type Endpoints = {
  inferenceBaseUrl: string;
  modelsUrl: string;
};

export type ModelsCache = {
  version: typeof MODELS_CACHE_VERSION;
  modelsUrl: string;
  fetchedAt: number;
  models: ProviderModelConfig[];
};

function logWarn(message: string): void {
  console.warn(`[${EXTENSION_NAME}] ${message}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  const url = new URL(raw);
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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function writeTextFile(path: string, text: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  } catch (error) {
    logWarn(`failed to write ${path}: ${errorMessage(error)}`);
  }
}

// --- models.dev pricing

type CostEntry = { providerId: string; modelId: string; cost: ModelCost };

/** models.dev prices keyed by lower-case id and by alphanumeric-only id. */
export type CostCatalog = {
  exact: Map<string, CostEntry[]>;
  normalized: Map<string, CostEntry[]>;
};

type ModelsDevCache = { timestamp: number; providers: Record<string, unknown> };

function readRates(source: Record<string, unknown>, fallback: ModelCostRates): ModelCostRates {
  return {
    input: finiteNumber(source.input) ?? fallback.input,
    output: finiteNumber(source.output) ?? fallback.output,
    cacheRead: finiteNumber(source.cache_read) ?? fallback.cacheRead,
    cacheWrite: finiteNumber(source.cache_write) ?? fallback.cacheWrite,
  };
}

/** Map a models.dev `cost` object to pi's cost shape, including context tiers. */
function parseModelsDevCost(raw: unknown): ModelCost | undefined {
  const source = asRecord(raw);
  if (!source) return undefined;
  if (finiteNumber(source.input) === undefined && finiteNumber(source.output) === undefined) {
    return undefined;
  }
  const cost: ModelCost = readRates(source, ZERO_COST);

  const tiers: ModelCostTier[] = [];
  for (const rawTier of Array.isArray(source.tiers) ? source.tiers : []) {
    const tier = asRecord(rawTier);
    const descriptor = asRecord(tier?.tier);
    if (!tier || (descriptor?.type !== undefined && descriptor.type !== "context")) continue;
    const size = positiveNumber(descriptor?.size);
    if (size === undefined) continue;
    tiers.push({ ...readRates(tier, cost), inputTokensAbove: size });
  }
  // Older records expose only this shortcut for the tier above 200k tokens.
  const over200k = asRecord(source.context_over_200k);
  if (tiers.length === 0 && over200k) {
    tiers.push({ ...readRates(over200k, cost), inputTokensAbove: 200000 });
  }
  if (tiers.length > 0) {
    cost.tiers = tiers.sort((a, b) => a.inputTokensAbove - b.inputTokensAbove);
  }
  return cost;
}

function normalizeModelKey(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function addCostEntry(map: Map<string, CostEntry[]>, key: string, entry: CostEntry): void {
  const entries = map.get(key) ?? [];
  entries.push(entry);
  map.set(key, entries);
}

/** Index the `providers` object of models.dev `api.json`. */
export function buildCostCatalog(providers: Record<string, unknown>): CostCatalog {
  const catalog: CostCatalog = { exact: new Map(), normalized: new Map() };
  for (const [providerId, providerValue] of Object.entries(providers)) {
    const models = asRecord(asRecord(providerValue)?.models);
    if (!models) continue;
    for (const [modelId, modelValue] of Object.entries(models)) {
      const cost = parseModelsDevCost(asRecord(modelValue)?.cost);
      if (!cost) continue;
      const entry: CostEntry = { providerId, modelId, cost };
      addCostEntry(catalog.exact, modelId.toLowerCase(), entry);
      addCostEntry(catalog.normalized, normalizeModelKey(modelId), entry);
    }
  }
  return catalog;
}

function selectCostEntry(entries: CostEntry[], modelId: string): CostEntry | undefined {
  if (entries.length === 0) return undefined;
  if (OPENAI_MODEL_PATTERN.test(modelId)) {
    for (const providerId of OPENAI_PROVIDER_PREFERENCE) {
      const match = entries.find((entry) => entry.providerId === providerId);
      if (match) return match;
    }
  }
  const prices = new Set(entries.map((entry) => JSON.stringify(entry.cost)));
  if (prices.size === 1) return entries[0];
  // Resellers disagree and none is preferred: do not pick an arbitrary price.
  return undefined;
}

/** Price for a model id, or zero cost when models.dev has no unambiguous entry. */
export function matchModelCost(modelId: string, catalog: CostCatalog): ModelCost {
  const id = modelId.trim().toLowerCase();
  const entry =
    selectCostEntry(catalog.exact.get(id) ?? [], id) ??
    selectCostEntry(catalog.normalized.get(normalizeModelKey(id)) ?? [], id);
  return entry ? structuredClone(entry.cost) : { ...ZERO_COST };
}

function isModelsDevProviders(value: unknown): value is Record<string, unknown> {
  const providers = asRecord(value);
  return (
    !!providers &&
    Object.values(providers).some((provider) => asRecord(asRecord(provider)?.models) !== undefined)
  );
}

function readModelsDevCache(cachePath: string): ModelsDevCache | null {
  try {
    const parsed = asRecord(JSON.parse(readFileSync(cachePath, "utf8")));
    const timestamp = finiteNumber(parsed?.timestamp);
    const providers = parsed?.providers;
    if (timestamp === undefined || !isModelsDevProviders(providers)) return null;
    return { timestamp, providers };
  } catch {
    return null;
  }
}

/**
 * Load models.dev prices: fresh cache, then network, then stale cache, then
 * an empty catalog. Never throws.
 */
export async function loadCostCatalog(
  cachePath: string,
  options: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<CostCatalog> {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const cached = readModelsDevCache(cachePath);
  if (cached && now - cached.timestamp < MODELS_DEV_CACHE_TTL_MS) {
    return buildCostCatalog(cached.providers);
  }
  try {
    const response = await fetchImpl(MODELS_DEV_URL, {
      signal: AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS),
    });
    if (response.ok) {
      const providers: unknown = await response.json();
      if (isModelsDevProviders(providers)) {
        const cache: ModelsDevCache = { timestamp: now, providers };
        writeTextFile(cachePath, JSON.stringify(cache));
        return buildCostCatalog(providers);
      }
    }
  } catch {
    // Fall through to the stale cache.
  }
  return buildCostCatalog(cached?.providers ?? {});
}

// --- catalog mapping

/** Map one catalog entry to a pi model. Returns null for hidden or slug-less entries. */
export function toPiModel(
  model: CodexCatalogModel,
  costCatalog?: CostCatalog,
): ProviderModelConfig | null {
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
    // proxy runs routing.session-affinity: true, so one pi session sticks to
    // one upstream account. Long cache retention is safe while only Codex
    // upstreams are authed.
    compat: {
      sessionAffinityFormat: "openai",
      supportsLongCacheRetention: true,
    },
  };
}

function isProviderModel(value: unknown): value is ProviderModelConfig {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<ProviderModelConfig>;
  return (
    typeof model.id === "string" &&
    typeof model.name === "string" &&
    typeof model.reasoning === "boolean" &&
    Array.isArray(model.input) &&
    typeof model.contextWindow === "number" &&
    typeof model.maxTokens === "number" &&
    !!model.cost &&
    typeof model.cost === "object"
  );
}

/** Validate a parsed cache file. Rejects other versions and other catalog URLs. */
export function parseModelsCache(raw: unknown, modelsUrl: string): ProviderModelConfig[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cache = raw as Partial<ModelsCache>;
  if (cache.version !== MODELS_CACHE_VERSION) return null;
  if (cache.modelsUrl !== modelsUrl) return null;
  if (typeof cache.fetchedAt !== "number") return null;
  if (!Array.isArray(cache.models) || !cache.models.every(isProviderModel)) return null;
  return cache.models;
}

function readModelsCache(cachePath: string, modelsUrl: string): ProviderModelConfig[] | null {
  let text: string;
  try {
    text = readFileSync(cachePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logWarn(`failed to read ${cachePath}: ${errorMessage(error)}`);
    }
    return null;
  }
  try {
    return parseModelsCache(JSON.parse(text), modelsUrl);
  } catch (error) {
    logWarn(`ignoring invalid ${cachePath}: ${errorMessage(error)}`);
    return null;
  }
}

function writeModelsCache(cachePath: string, modelsUrl: string, models: ProviderModelConfig[]): void {
  const cache: ModelsCache = {
    version: MODELS_CACHE_VERSION,
    modelsUrl,
    fetchedAt: Date.now(),
    models,
  };
  writeTextFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

// --- pause gate

/** Read `cliproxyapi.json`. A missing file is `{}`. Throws on invalid content. */
function readConfigFile(configPath: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const parsed = asRecord(JSON.parse(text));
  if (!parsed) throw new Error(`${CONFIG_FILE_NAME} must contain a JSON object`);
  return parsed;
}

/** Persisted pause flag. A missing file or key means not paused. Throws when the value is not a boolean. */
export function readPauseSetting(configPath: string): boolean {
  const value = readConfigFile(configPath).pause;
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new Error(`${CONFIG_FILE_NAME} field "pause" must be a boolean`);
  }
  return value;
}

/** Write the pause flag and keep the other keys of the file. Throws on write failure. */
export function savePauseSetting(configPath: string, pause: boolean): void {
  let existing: Record<string, unknown> = {};
  try {
    existing = readConfigFile(configPath);
  } catch {
    // An unreadable file is replaced.
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify({ ...existing, pause }, null, 2)}\n`, "utf8");
}

/** In-memory pause state shared by the commands and the request gate. */
export class PauseController {
  private paused: boolean;

  constructor(paused = false) {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }
}

/**
 * Block until the pause ends. The file is re-read on every poll, so
 * `/continue` in another pi instance also releases the gate. When the file is
 * unreadable, the in-memory state stands. An aborted signal releases the gate.
 */
export async function waitForPauseToEnd(
  configPath: string,
  controller: PauseController,
  options: { pollMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const pollMs = options.pollMs ?? PAUSE_POLL_INTERVAL_MS;
  while (!options.signal?.aborted) {
    try {
      controller.setPaused(readPauseSetting(configPath));
    } catch {
      // Keep the current in-memory state.
    }
    if (!controller.isPaused()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// --- transient stream errors

/**
 * Return a copy whose `errorMessage` starts with `network error:` when a
 * `cliproxyapi` error message matches a known transient stream failure that
 * pi would not retry on its own. Otherwise return the same object.
 */
export function normalizeTransientNetworkError(
  message: AssistantMessage,
  providerId: string = PROVIDER_ID,
): AssistantMessage {
  if (message.provider !== providerId || message.stopReason !== "error" || !message.errorMessage) {
    return message;
  }
  if (isRetryableAssistantError(message) || !TRANSIENT_STREAM_ERROR_PATTERN.test(message.errorMessage)) {
    return message;
  }
  return { ...message, errorMessage: `${NETWORK_ERROR_PREFIX}${message.errorMessage}` };
}

export default async function (pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const endpoints = resolveEndpoints(process.env[BASE_URL_ENV_VAR]);
  const cachePath = join(agentDir, MODELS_CACHE_FILE_NAME);
  const costCachePath = join(agentDir, MODELS_DEV_CACHE_FILE);
  // Only the newest fetch may commit, so a slow background refresh cannot
  // overwrite the result of a later /cliproxyapi-refresh.
  let generation = 0;

  const register = (models: ProviderModelConfig[]): void => {
    pi.registerProvider(PROVIDER_ID, {
      name: PROVIDER_NAME,
      baseUrl: endpoints.inferenceBaseUrl,
      api: "openai-responses",
      // Resolved by pi from the environment at request time.
      apiKey: `$${API_KEY_ENV_VAR}`,
      models,
    });
  };

  /** Fetch, cache, and register. Returns null when a newer fetch superseded this one. */
  const refresh = async (): Promise<ProviderModelConfig[] | null> => {
    const current = ++generation;
    const [catalog, costCatalog] = await Promise.all([
      fetchCodexModels(endpoints.modelsUrl, process.env[API_KEY_ENV_VAR], MODELS_REQUEST_TIMEOUT_MS),
      loadCostCatalog(costCachePath),
    ]);
    if (current !== generation) return null;
    const models = catalog
      .map((entry) => toPiModel(entry, costCatalog))
      .filter((model): model is ProviderModelConfig => model !== null);
    writeModelsCache(cachePath, endpoints.modelsUrl, models);
    register(models);
    return models;
  };

  const cached = readModelsCache(cachePath, endpoints.modelsUrl);
  if (cached) {
    register(cached);
    void refresh().catch((error) => {
      logWarn(
        `background model refresh failed: ${errorMessage(error)}; keeping ${cached.length} cached models`,
      );
    });
  } else {
    try {
      await refresh();
    } catch (error) {
      logWarn(`model discovery failed: ${errorMessage(error)}; no ${PROVIDER_NAME} models registered`);
    }
  }

  pi.registerCommand("cliproxyapi-refresh", {
    description: `Refresh the ${PROVIDER_NAME} model catalog`,
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /cliproxyapi-refresh (no arguments)", "error");
        return;
      }
      try {
        const models = await refresh();
        if (!models) {
          ctx.ui.notify(`${PROVIDER_NAME}: refresh superseded by a newer refresh`, "warning");
          return;
        }
        ctx.ui.notify(`${PROVIDER_NAME}: registered ${models.length} models`, "info");
      } catch (error) {
        ctx.ui.notify(`${PROVIDER_NAME} refresh failed: ${errorMessage(error)}`, "error");
      }
    },
  });

  const configPath = join(agentDir, CONFIG_FILE_NAME);
  let initialPause = false;
  try {
    initialPause = readPauseSetting(configPath);
  } catch (error) {
    logWarn(`ignoring pause setting: ${errorMessage(error)}`);
  }
  const pause = new PauseController(initialPause);

  pi.on("session_start", (_event, ctx) => {
    if (pause.isPaused()) ctx.ui.setStatus(PAUSE_STATUS_KEY, "paused");
  });

  pi.on("before_provider_request", async (_event, ctx) => {
    if (ctx.model?.provider !== PROVIDER_ID) return;
    await waitForPauseToEnd(configPath, pause, { signal: ctx.signal });
  });

  const setPaused = (paused: boolean, ctx: ExtensionCommandContext): void => {
    try {
      savePauseSetting(configPath, paused);
    } catch (error) {
      ctx.ui.notify(`Failed to save ${CONFIG_FILE_NAME}: ${errorMessage(error)}`, "error");
      return;
    }
    pause.setPaused(paused);
    ctx.ui.setStatus(PAUSE_STATUS_KEY, paused ? "paused" : undefined);
    ctx.ui.notify(
      paused
        ? `${PROVIDER_NAME} requests paused until /continue`
        : `${PROVIDER_NAME} requests resumed`,
      "info",
    );
  };

  pi.registerCommand("pause", {
    description: `Hold ${PROVIDER_NAME} requests until /continue`,
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /pause (no arguments)", "error");
        return;
      }
      setPaused(true, ctx);
    },
  });

  pi.registerCommand("continue", {
    description: `Release ${PROVIDER_NAME} requests held by /pause`,
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /continue (no arguments)", "error");
        return;
      }
      setPaused(false, ctx);
    },
  });

  pi.on("message_end", (event) => {
    const { message } = event;
    if (message.role !== "assistant") return;
    const normalized = normalizeTransientNetworkError(message);
    return normalized === message ? undefined : { message: normalized };
  });
}
