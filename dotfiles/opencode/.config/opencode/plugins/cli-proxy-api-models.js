import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PLUGIN_NAME = "cli-proxy-api-models";
const DEFAULT_PROVIDER_ID = "openai";
const DEFAULT_CACHE_DAYS = 7;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_OVERWRITE = "1";
const CACHE_VERSION = 2;

// Any client_version query value switches CLIProxyAPI from the bare OpenAI
// model list to the Codex catalog, which carries visibility, display names,
// context windows, output limits, reasoning levels and service tiers.
const CATALOG_CLIENT_VERSION = "opencode";

// Reasoning levels opencode may already know for a model (from models.dev).
// Levels the catalog does not list are disabled so the picker matches the
// proxy. Levels the catalog adds (for example "ultra") are enabled.
const KNOWN_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const OPENAI_REASONING_INCLUDE = ["reasoning.encrypted_content"];

// The catalog advertises "ultra" (Codex multi-agent delegation) for the
// gpt-5.6 models, but CLIProxyAPI rejects it: `level "ultra" not supported,
// valid levels: low, medium, high, xhigh, max` (internal/thinking/validate.go).
const PROXY_REJECTED_EFFORTS = ["ultra"];

// models.dev exposes the priority service tier as a "<id>-fast" model. Keep
// that model visible and give it the same limits when the catalog reports the
// tier. This relies on models.dev defining the mode; without it opencode would
// create a "<id>-fast" model the proxy does not serve.
const FAST_SERVICE_TIER = "priority";
const FAST_MODEL_SUFFIX = "-fast";

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return boolFromString(fallback);
  return boolFromString(value);
}

function boolFromString(value) {
  return !/^(0|false|no|off)$/i.test(value);
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function cachePath() {
  const root =
    process.env.XDG_CACHE_HOME || join(process.env.HOME || ".", ".cache");
  return join(root, "opencode", `${PLUGIN_NAME}.json`);
}

function normalizeModelsURL(baseURL) {
  const url = new URL(baseURL);
  url.pathname = url.pathname.replace(/\/$/, "") + "/models";
  url.search = `client_version=${CATALOG_CLIENT_VERSION}`;
  url.hash = "";
  return url.toString();
}

function isCatalogModel(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.hidden === "boolean" &&
    Array.isArray(value.efforts) &&
    Array.isArray(value.serviceTiers)
  );
}

function readCache(path, modelsURL, maxAgeMs) {
  if (!existsSync(path)) return null;

  try {
    const cache = JSON.parse(readFileSync(path, "utf8"));
    if (
      cache.version !== CACHE_VERSION ||
      cache.modelsURL !== modelsURL ||
      typeof cache.updatedAt !== "number" ||
      !Array.isArray(cache.models) ||
      !cache.models.every(isCatalogModel)
    )
      return null;

    const age = Date.now() - cache.updatedAt;
    return { models: cache.models, stale: !(age >= 0 && age < maxAgeMs) };
  } catch (error) {
    console.warn(`[${PLUGIN_NAME}] Failed to read cache: ${error.message}`);
    return null;
  }
}

function writeCache(path, modelsURL, models) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        { version: CACHE_VERSION, modelsURL, updatedAt: Date.now(), models },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    console.warn(`[${PLUGIN_NAME}] Failed to write cache: ${error.message}`);
  }
}

function normalizeCatalogModel(model) {
  if (!model || typeof model !== "object") return null;
  const id = typeof model.slug === "string" ? model.slug.trim() : "";
  if (!id) return null;

  const displayName =
    typeof model.display_name === "string" ? model.display_name.trim() : "";
  const levels = Array.isArray(model.supported_reasoning_levels)
    ? model.supported_reasoning_levels
    : [];
  const efforts = levels
    .map((level) =>
      level && typeof level.effort === "string"
        ? level.effort.trim().toLowerCase()
        : "",
    )
    .filter((effort, index, all) => effort && all.indexOf(effort) === index);
  const tiers = Array.isArray(model.service_tiers) ? model.service_tiers : [];
  const serviceTiers = tiers
    .map((tier) => (typeof tier === "string" ? tier : tier?.id))
    .filter((tier) => typeof tier === "string" && tier);

  return {
    id,
    name: displayName || id,
    hidden: String(model.visibility ?? "").toLowerCase() === "hide",
    contextWindow:
      positiveNumber(model.context_window) ??
      positiveNumber(model.max_context_window),
    maxTokens: positiveNumber(model.max_tokens),
    efforts,
    serviceTiers,
  };
}

async function fetchModels(modelsURL, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(modelsURL, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);

    const body = await response.json();
    const entries = Array.isArray(body)
      ? body
      : Array.isArray(body?.models)
        ? body.models
        : Array.isArray(body?.data)
          ? body.data
          : null;
    if (!entries)
      throw new Error("response did not include a models array");

    return entries.map(normalizeCatalogModel).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

function buildVariants(efforts) {
  const variants = {};
  for (const effort of efforts) {
    variants[effort] = {
      reasoningEffort: effort,
      reasoningSummary: "auto",
      include: OPENAI_REASONING_INCLUDE,
    };
  }
  for (const effort of KNOWN_REASONING_EFFORTS) {
    if (!efforts.includes(effort)) variants[effort] = { disabled: true };
  }
  return variants;
}

function modelEntry(model, name = model.name) {
  const efforts = model.efforts.filter(
    (effort) => !PROXY_REJECTED_EFFORTS.includes(effort),
  );
  const entry = { name, reasoning: efforts.length > 0 };

  if (model.contextWindow && model.maxTokens) {
    entry.limit = { context: model.contextWindow, output: model.maxTokens };
  }
  if (efforts.length > 0) entry.variants = buildVariants(efforts);

  return entry;
}

function modelEntries(model) {
  const entries = [[model.id, modelEntry(model)]];
  if (model.serviceTiers.includes(FAST_SERVICE_TIER)) {
    entries.push([
      `${model.id}${FAST_MODEL_SUFFIX}`,
      modelEntry(model, `${model.name} Fast`),
    ]);
  }
  return entries;
}

async function loadModels(provider) {
  const options = provider.options || {};
  const baseURL = typeof options.baseURL === "string" ? options.baseURL : null;

  if (!baseURL) {
    console.warn(`[${PLUGIN_NAME}] provider has no options.baseURL`);
    return [];
  }

  const modelsURL = normalizeModelsURL(baseURL);
  const path = cachePath();
  const cacheDays = numberFromEnv(
    "OPENCODE_CLI_PROXY_MODELS_CACHE_DAYS",
    DEFAULT_CACHE_DAYS,
  );
  const timeoutMs = numberFromEnv(
    "OPENCODE_CLI_PROXY_MODELS_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
  );
  const maxAgeMs = cacheDays * 24 * 60 * 60 * 1000;
  const cached =
    process.env.OPENCODE_CLI_PROXY_MODELS_FORCE_REFRESH === "1"
      ? null
      : readCache(path, modelsURL, maxAgeMs);

  if (cached && !cached.stale) return cached.models;

  const refresh = fetchModels(modelsURL, options.apiKey, timeoutMs).then(
    (models) => {
      writeCache(path, modelsURL, models);
      return models;
    },
  );

  if (cached) {
    // The config hook cannot update the running model list, so serve the
    // stale cache now and refresh it for the next start.
    refresh.catch((error) => {
      console.warn(
        `[${PLUGIN_NAME}] Background model refresh failed: ${error.message}`,
      );
    });
    return cached.models;
  }

  try {
    return await refresh;
  } catch (error) {
    console.warn(`[${PLUGIN_NAME}] Model discovery failed: ${error.message}`);
    return [];
  }
}

export const CliProxyApiModels = async () => ({
  config: async (config) => {
    const providerID =
      process.env.OPENCODE_CLI_PROXY_MODELS_PROVIDER || DEFAULT_PROVIDER_ID;
    const provider = config.provider?.[providerID];
    if (!provider) return;

    const overwrite = boolFromEnv(
      "OPENCODE_CLI_PROXY_MODELS_OVERWRITE",
      DEFAULT_OVERWRITE,
    );
    const discovered = (await loadModels(provider)).filter(
      (model) => !model.hidden,
    );
    if (discovered.length === 0) return;

    provider.models ||= {};
    const ids = [];
    for (const model of discovered) {
      for (const [id, entry] of modelEntries(model)) {
        ids.push(id);
        if (provider.models[id] && !overwrite) continue;
        provider.models[id] = entry;
      }
    }

    // Hide the models.dev entries the proxy does not serve.
    provider.whitelist = [
      ...new Set([...(provider.whitelist ?? []), ...ids]),
    ].sort();
  },
});
