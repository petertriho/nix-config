import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PLUGIN_NAME = "cli-proxy-api-models";
const DEFAULT_PROVIDER_ID = "openai";
const DEFAULT_CACHE_DAYS = 7;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_OVERWRITE = "1";

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

function cachePath() {
  const root =
    process.env.XDG_CACHE_HOME || join(process.env.HOME || ".", ".cache");
  return join(root, "opencode", `${PLUGIN_NAME}.json`);
}

function normalizeModelsURL(baseURL) {
  const url = new URL(baseURL);
  url.pathname = url.pathname.replace(/\/$/, "") + "/models";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function readCache(path, maxAgeMs) {
  if (!existsSync(path)) return null;

  try {
    const cache = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(cache.models) || typeof cache.updatedAt !== "number")
      return null;

    const age = Date.now() - cache.updatedAt;
    if (age >= 0 && age < maxAgeMs) return cache.models;
    return { stale: cache.models };
  } catch (error) {
    console.warn(`[${PLUGIN_NAME}] Failed to read cache: ${error.message}`);
    return null;
  }
}

function writeCache(path, models) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ updatedAt: Date.now(), models }, null, 2) + "\n",
    );
  } catch (error) {
    console.warn(`[${PLUGIN_NAME}] Failed to write cache: ${error.message}`);
  }
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
    if (!Array.isArray(body.data))
      throw new Error("response did not include a data array");

    return body.data
      .map((model) => (model && typeof model.id === "string" ? model.id : null))
      .filter(Boolean)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .sort();
  } finally {
    clearTimeout(timeout);
  }
}

function isChatModel(id) {
  return !/(^|[-_/])(embedding|embed|rerank|image)([-_/]|$)/i.test(id);
}

function modelEntry(id) {
  const entry = { id, name: id };

  if (/(thinking|reasoning|gpt-oss|^o[134](?:-|$)|^gpt-5)/i.test(id)) {
    entry.reasoning = true;
  }

  return entry;
}

async function loadModels(provider) {
  const options = provider.options || {};
  const baseURL = typeof options.baseURL === "string" ? options.baseURL : null;

  if (!baseURL) {
    console.warn(`[${PLUGIN_NAME}] provider has no options.baseURL`);
    return [];
  }

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
      : readCache(path, maxAgeMs);

  if (Array.isArray(cached)) return cached;

  try {
    const models = await fetchModels(
      normalizeModelsURL(baseURL),
      options.apiKey,
      timeoutMs,
    );
    writeCache(path, models);
    // console.log(
    //   `[${PLUGIN_NAME}] Cached ${models.length} models from ${baseURL}`,
    // );
    return models;
  } catch (error) {
    const stale = cached && Array.isArray(cached.stale) ? cached.stale : [];
    const suffix =
      stale.length > 0 ? `; using ${stale.length} stale cached models` : "";
    console.warn(
      `[${PLUGIN_NAME}] Model discovery failed: ${error.message}${suffix}`,
    );
    return stale;
  }
}

export const CliProxyApiModels = async () => ({
  config: async (config) => {
    const providerID =
      process.env.OPENCODE_CLI_PROXY_MODELS_PROVIDER || DEFAULT_PROVIDER_ID;
    const provider = config.provider?.[providerID];
    if (!provider) return;

    provider.models ||= {};
    const overwrite = boolFromEnv(
      "OPENCODE_CLI_PROXY_MODELS_OVERWRITE",
      DEFAULT_OVERWRITE,
    );
    const discovered = await loadModels(provider);

    let added = 0;
    let replaced = 0;
    for (const id of discovered.filter(isChatModel)) {
      const existed = !!provider.models[id];
      if (existed && !overwrite) continue;
      provider.models[id] = modelEntry(id);
      if (existed) replaced += 1;
      else added += 1;
    }

    // if (added > 0 || replaced > 0) {
    //   console.log(
    //     `[${PLUGIN_NAME}] Added ${added} models and replaced ${replaced} models in provider.${providerID}`,
    //   );
    // }
  },
});
