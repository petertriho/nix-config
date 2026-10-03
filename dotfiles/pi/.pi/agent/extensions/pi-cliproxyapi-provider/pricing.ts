import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelCost, ModelCostRates, ModelCostTier } from "@earendil-works/pi-ai";
import { asRecord, finiteNumber, positiveNumber, writeTextFile, ZERO_COST } from "./shared.ts";

const MODELS_DEV_URL = "https://models.dev/api.json";

const MODELS_DEV_TIMEOUT_MS = 3_000;

const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const MODELS_DEV_CACHE_FILE = join("tmp", "models-dev-cache.json");

// For these ids, first-party prices win over reseller entries.
const OPENAI_MODEL_PATTERN = /^(?:gpt-|o[134](?:-|$)|codex-)/;

const OPENAI_PROVIDER_PREFERENCE = ["openai", "openai-codex", "opencode"];

// --- models.dev pricing

type CostEntry = { providerId: string; modelId: string; cost: ModelCost; fastCost?: ModelCost };

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
      const model = asRecord(modelValue);
      const cost = parseModelsDevCost(model?.cost);
      if (!cost) continue;
      const modes = asRecord(asRecord(model?.experimental)?.modes);
      const fastCost = parseModelsDevCost(asRecord(modes?.fast)?.cost);
      const entry: CostEntry = { providerId, modelId, cost, ...(fastCost ? { fastCost } : {}) };
      addCostEntry(catalog.exact, modelId.toLowerCase(), entry);
      addCostEntry(catalog.normalized, normalizeModelKey(modelId), entry);
    }
  }
  return catalog;
}

function selectCostEntry(entries: CostEntry[], modelId: string, fast = false): CostEntry | undefined {
  if (entries.length === 0) return undefined;
  if (OPENAI_MODEL_PATTERN.test(modelId)) {
    for (const providerId of OPENAI_PROVIDER_PREFERENCE) {
      const match = entries.find((entry) => entry.providerId === providerId);
      if (match) return match;
    }
  }
  const prices = new Set(entries.map((entry) => JSON.stringify(fast ? entry.fastCost ?? entry.cost : entry.cost)));
  if (prices.size === 1) return entries[0];
  // Resellers disagree and none is preferred: do not pick an arbitrary price.
  return undefined;
}

export function findCostEntry(modelId: string, catalog: CostCatalog, fast = false): CostEntry | undefined {
  const id = modelId.trim().toLowerCase();
  return (
    selectCostEntry(catalog.exact.get(id) ?? [], id, fast) ??
    selectCostEntry(catalog.normalized.get(normalizeModelKey(id)) ?? [], id, fast)
  );
}

/** Price for a model id, with standard rates when no Fast rates are published. */

export function matchModelCost(modelId: string, catalog: CostCatalog, fast = false): ModelCost {
  const entry = findCostEntry(modelId, catalog, fast) ?? (fast ? findCostEntry(modelId, catalog) : undefined);
  return entry ? structuredClone((fast && entry.fastCost) || entry.cost) : { ...ZERO_COST };
}

function isModelsDevProviders(value: unknown): value is Record<string, unknown> {
  const providers = asRecord(value);
  return (
    !!providers &&
    Object.values(providers).some((provider) => asRecord(asRecord(provider)?.models) !== undefined)
  );
}

export function readModelsDevCache(cachePath: string): ModelsDevCache | null {
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
