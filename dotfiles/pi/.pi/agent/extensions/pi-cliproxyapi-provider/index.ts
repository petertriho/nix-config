/**
 * CLIProxyAPI provider for pi.
 *
 * Registers the `cliproxyapi` provider with models discovered from the proxy's
 * Codex catalog (`/v1/models?client_version=pi`) and served over pi's stock
 * `openai-responses` API at `${root}/v1`. Native pi providers stay untouched.
 *
 * Startup is cache-first: a current `~/.pi/agent/cliproxyapi-models.json`
 * registers at once and refreshes in the background. A legacy cache is
 * refreshed synchronously so grammar-tool capability is verified; if that
 * fails, its models remain available with grammar tools forced off. Without a
 * cache, the catalog is fetched synchronously with a short timeout.
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
 *   CLIPROXYAPI_FAST      Startup override for the persisted Fast preference.
 *                         Accepts true/false, 1/0, yes/no, and on/off.
 *
 *   CLIPROXYAPI_MANAGEMENT_KEY  Management key for account quota queries.
 *                              Falls back to config.managementKey, then the
 *                              Nix service's CLI_PROXY_API_KEY.
 *
 * Commands:
 *   /quota               Show live Codex account quotas without adding them
 *                         to model context.
 *   /quota-resume [on|off|status]
 *                         Toggle or inspect automatic quota waiting. Saves
 *                         quotaResume in cliproxyapi.json. Only empty failed
 *                         requests can resume. Escape or off cancels a wait.
 *   /fast                Toggle priority processing for models whose catalog
 *                         entry has a non-empty `service_tiers` array. Saves
 *                         the preference in `cliproxyapi.json`. Priority
 *                         processing can use more credits or cost more.
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


import { join } from "node:path";
import { type ModelCost, hasApi } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { asRecord, API_KEY_ENV_VAR, BASE_URL_ENV_VAR, errorMessage, logWarn, PROVIDER_ID, PROVIDER_NAME, MODEL_CATALOG_REFRESHED_EVENT, PAUSE_STATUS_KEY, FAST_STATUS_KEY, QUOTA_RESUME_STATUS_KEY, QUOTA_WAIT_STATUS_KEY } from "./shared.ts";
import { CONFIG_FILE_NAME, readFastSetting, readPauseSetting, readQuotaResumeSetting, resolveManagementKey, saveFastSetting, savePauseSetting, saveQuotaResumeSetting } from "./config.ts";
import { MODELS_CACHE_FILE_NAME, type ProviderChatModelConfig, resolveEndpoints, fetchCodexModels, toPiModel, readModelsCache, writeModelsCache } from "./catalog.ts";
import { MODELS_DEV_CACHE_FILE, buildCostCatalog, findCostEntry, readModelsDevCache, loadCostCatalog } from "./pricing.ts";
import { PauseController, waitForPauseToEnd, streamWithCatalogPricing, normalizeTransientNetworkError } from "./stream.ts";
import { formatQuotaSnapshot, hasConfirmedQuotaExhaustion, loadQuotaSnapshot, quotaAvailability } from "./quota.ts";
import { formatQuotaWait, QuotaResumeController, streamWithQuotaResume } from "./resume.ts";
import { QuotaInspectionError, QuotaModal } from "./quota-ui.ts";

const MODELS_REQUEST_TIMEOUT_MS = 10_000;

export default async function (pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const endpoints = resolveEndpoints(process.env[BASE_URL_ENV_VAR]);
  const cachePath = join(agentDir, MODELS_CACHE_FILE_NAME);
  const costCachePath = join(agentDir, MODELS_DEV_CACHE_FILE);
  const configPath = join(agentDir, CONFIG_FILE_NAME);
  let fast = false;
  try {
    fast = readFastSetting(configPath);
  } catch (error) {
    logWarn(`ignoring Fast setting: ${errorMessage(error)}`);
  }
  let quotaResume = false;
  try {
    quotaResume = readQuotaResumeSetting(configPath);
  } catch (error) {
    logWarn(`ignoring quota resume setting: ${errorMessage(error)}`);
  }
  const lifetime = new AbortController();
  const quotaRequests = new QuotaResumeController();
  const quotaWaits = new Map<symbol, { modelId: string; resetAt: number }>();
  const quotaCommands = new Set<AbortController>();
  let inspector: { modal?: QuotaModal; closed: boolean } | undefined;
  const closeInspector = (): void => {
    if (!inspector) return;
    inspector.closed = true;
    inspector.modal?.close();
  };
  let costCatalog = buildCostCatalog(readModelsDevCache(costCachePath)?.providers ?? {});
  let modelDefinitions: ProviderChatModelConfig[] = [];
  let registeredModels: ProviderChatModelConfig[] = [];
  // Keep base prices for a selected model that disappears during a refresh.
  const standardCosts = new Map<string, ModelCost>();
  let fastModelIds = new Set<string>();
  let activeContext: ExtensionContext | undefined;

  const isFastEffective = (model: ExtensionContext["model"]): boolean =>
    fast && model?.provider === PROVIDER_ID && fastModelIds.has(model.id);

  const updateFastStatus = (ctx: ExtensionContext, model = ctx.model): void => {
    if (model?.provider === PROVIDER_ID) {
      const registeredModel = registeredModels.find((entry) => entry.id === model.id);
      const cost = registeredModel?.cost ?? standardCosts.get(model.id);
      if (cost) model.cost = structuredClone(cost);
    }
    ctx.ui.setStatus(FAST_STATUS_KEY, isFastEffective(model) ? "fast" : undefined);
  };

  const updateQuotaStatus = (ctx: ExtensionContext, model = ctx.model): void => {
    const selected = model?.provider === PROVIDER_ID;
    ctx.ui.setStatus(QUOTA_RESUME_STATUS_KEY, selected && quotaResume ? "quota resume" : undefined);
    const resets = selected && quotaResume
      ? [...quotaWaits.values()].filter((wait) => wait.modelId === model.id).map((wait) => wait.resetAt)
      : [];
    ctx.ui.setStatus(QUOTA_WAIT_STATUS_KEY, resets.length ? formatQuotaWait(Math.min(...resets)) : undefined);
  };

  // Only the newest fetch may commit, so a slow background refresh cannot
  // overwrite the result of a later /cliproxyapi-refresh.
  let generation = 0;

  const register = (models: ProviderChatModelConfig[], supportedIds = [...fastModelIds]): void => {
    modelDefinitions = models;
    fastModelIds = new Set(supportedIds);
    registeredModels = models.map((model) => {
      standardCosts.set(model.id, structuredClone(model.cost));
      const fastCost = fast && fastModelIds.has(model.id) ? findCostEntry(model.id, costCatalog, true)?.fastCost : undefined;
      return { ...model, cost: structuredClone(fastCost ?? model.cost) };
    });
    pi.registerProvider(PROVIDER_ID, {
      name: PROVIDER_NAME,
      baseUrl: endpoints.inferenceBaseUrl,
      api: "openai-responses",
      // Resolved by pi from the environment at request time.
      apiKey: `$${API_KEY_ENV_VAR}`,
      models: registeredModels,
      streamSimple: (model, context, options) => {
        if (!hasApi(model, "openai-responses")) throw new Error(`Unsupported ${PROVIDER_NAME} API: ${model.api}`);
        const requestContext = activeContext;
        const sessionId = requestContext?.sessionManager?.getSessionId();
        const waitId = Symbol("quota wait");
        const signal = options?.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
        return streamWithQuotaResume(model, { ...options, signal }, {
          enabled: () => quotaResume,
          controller: quotaRequests,
          stream: (requestOptions) => streamWithCatalogPricing(model, context, requestOptions, () => {
            const fastCost = fastModelIds.has(model.id) ? findCostEntry(model.id, costCatalog, true)?.fastCost : undefined;
            return {
              standard: structuredClone(standardCosts.get(model.id) ?? model.cost),
              fast: fastCost ? structuredClone(fastCost) : undefined,
            };
          }),
          inspect: async (requestSignal, hint) => {
            if (model.baseUrl.replace(/\/+$/, "") !== endpoints.inferenceBaseUrl.replace(/\/+$/, "")) {
              return { kind: "unknown", reason: "The model endpoint differs from the configured quota API; check the proxy configuration." };
            }
            const managementKey = resolveManagementKey(configPath, { ...process.env, ...options?.env });
            if (!managementKey) throw new Error("Set CLIPROXYAPI_MANAGEMENT_KEY to inspect quota");
            const snapshot = await loadQuotaSnapshot({
              baseUrl: endpoints.inferenceBaseUrl, managementKey, modelId: model.id, signal: requestSignal,
            });
            const availability = quotaAvailability(snapshot, model.id);
            if (hint.kind === "cooldown" && availability.kind === "wait" && !hasConfirmedQuotaExhaustion(snapshot, model.id)) {
              return { kind: "unknown", reason: "The account pool is cooling down, but subscription exhaustion is not verified." };
            }
            return availability;
          },
          beforeRetry: (requestSignal) => waitForPauseToEnd(configPath, pause, { signal: requestSignal }),
          isCurrent: () => !lifetime.signal.aborted && (!requestContext || (
            !!activeContext && activeContext.model?.provider === PROVIDER_ID && activeContext.model.id === model.id &&
            (sessionId === undefined || sessionId === activeContext.sessionManager?.getSessionId())
          )),
          onWait: (resetAt) => {
            if (resetAt === undefined) quotaWaits.delete(waitId);
            else quotaWaits.set(waitId, { modelId: model.id, resetAt });
            if (activeContext) updateQuotaStatus(activeContext);
          },
          onNotice: (message) => {
            if (activeContext?.model?.provider === PROVIDER_ID && activeContext.model.id === model.id) {
              activeContext.ui.notify(message, "info");
            }
          },
        });
      },
    });
    if (activeContext) updateFastStatus(activeContext);
  };

  /** Fetch, cache, and register. Returns null when a newer fetch superseded this one. */
  const refresh = async (): Promise<ProviderChatModelConfig[] | null> => {
    const current = ++generation;
    const [catalog, refreshedCostCatalog] = await Promise.all([
      fetchCodexModels(endpoints.modelsUrl, process.env[API_KEY_ENV_VAR], MODELS_REQUEST_TIMEOUT_MS, lifetime.signal),
      loadCostCatalog(costCachePath),
    ]);
    if (current !== generation) return null;
    costCatalog = refreshedCostCatalog;
    const models = catalog
      .map((entry) => toPiModel(entry, costCatalog))
      .filter((model): model is ProviderChatModelConfig => model !== null);
    const visibleIds = new Set(models.map((model) => model.id));
    const supportedIds = catalog
      .filter((entry) => Array.isArray(entry.service_tiers) && entry.service_tiers.length > 0)
      .map((entry) => (entry.slug ?? "").trim())
      .filter((id) => visibleIds.has(id));
    // Cache standard prices so changing Fast never makes offline startup use the wrong rates.
    writeModelsCache(cachePath, endpoints.modelsUrl, models, supportedIds);
    register(models, supportedIds);
    pi.events.emit(MODEL_CATALOG_REFRESHED_EVENT, { provider: PROVIDER_ID });
    return models;
  };

  const cached = readModelsCache(cachePath, endpoints.modelsUrl);
  let legacyFallbackActive = false;
  if (cached.kind === "current") {
    register(cached.models, cached.fastModelIds);
    void refresh().catch((error) => {
      logWarn(
        `background model refresh failed: ${errorMessage(error)}; keeping ${cached.models.length} cached models`,
      );
    });
  } else if (cached.kind === "legacy") {
    try {
      await refresh();
    } catch (error) {
      legacyFallbackActive = true;
      register(cached.models);
      logWarn(
        `legacy model cache refresh failed: ${errorMessage(error)}; registered ${cached.models.length} cached models with grammar tools disabled. After a successful /cliproxyapi-refresh, reselect the model or run /reload`,
      );
    }
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
        if (legacyFallbackActive) {
          legacyFallbackActive = false;
          ctx.ui.notify(
            `${PROVIDER_NAME}: registered ${models.length} models; reselect the model or run /reload to activate verified grammar tools`,
            "warning",
          );
        } else {
          ctx.ui.notify(`${PROVIDER_NAME}: registered ${models.length} models`, "info");
        }
      } catch (error) {
        ctx.ui.notify(`${PROVIDER_NAME} refresh failed: ${errorMessage(error)}`, "error");
      }
    },
  });

  let initialPause = false;
  try {
    initialPause = readPauseSetting(configPath);
  } catch (error) {
    logWarn(`ignoring pause setting: ${errorMessage(error)}`);
  }
  const pause = new PauseController(initialPause);

  pi.on("session_start", (_event, ctx) => {
    closeInspector();
    activeContext = ctx;
    if (pause.isPaused()) ctx.ui.setStatus(PAUSE_STATUS_KEY, "paused");
    updateFastStatus(ctx);
    updateQuotaStatus(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    if (!event.previousModel || event.previousModel.provider !== event.model.provider || event.previousModel.id !== event.model.id) {
      closeInspector();
      quotaRequests.cancelWaiting();
    }
    activeContext = ctx;
    updateFastStatus(ctx, event.model);
    updateQuotaStatus(ctx, event.model);
  });

  pi.on("input", (event) => {
    const command = event.text.trim().split(/\s+/, 1)[0];
    const controls = ["/quota", "/quota-resume", "/fast", "/pause", "/continue", "/cliproxyapi-refresh"];
    if (!controls.includes(command)) quotaRequests.cancelWaiting();
  });
  pi.on("session_before_switch", () => { closeInspector(); quotaRequests.cancelWaiting(); });
  pi.on("session_before_fork", () => { closeInspector(); quotaRequests.cancelWaiting(); });
  pi.on("session_before_tree", () => { closeInspector(); quotaRequests.cancelWaiting(); });
  pi.on("session_before_compact", () => { closeInspector(); quotaRequests.cancelWaiting(); });

  pi.on("session_shutdown", () => {
    closeInspector();
    ++generation;
    lifetime.abort();
    quotaRequests.cancelAll();
    for (const command of quotaCommands) command.abort();
    quotaCommands.clear();
    quotaWaits.clear();
    activeContext?.ui.setStatus(QUOTA_WAIT_STATUS_KEY, undefined);
    activeContext?.ui.setStatus(QUOTA_RESUME_STATUS_KEY, undefined);
    activeContext = undefined;
  });

  pi.on("before_provider_request", async (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER_ID) return;
    activeContext = ctx;
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, lifetime.signal]) : lifetime.signal;
    await waitForPauseToEnd(configPath, pause, { signal });
    if (signal.aborted || !isFastEffective(ctx.model)) return;
    const payload = asRecord(event.payload);
    return payload ? { ...payload, service_tier: "priority" } : undefined;
  });

  pi.registerCommand("quota", {
    description: "Show live CLIProxyAPI Codex account quotas and reset times",
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /quota (no arguments)", "error");
        return;
      }
      if (ctx.mode === "tui") {
        if (inspector || lifetime.signal.aborted) return;
        const interaction: { modal?: QuotaModal; closed: boolean } = { closed: false };
        inspector = interaction;
        try {
          await ctx.ui.custom<void>((tui, theme, keys, done) => {
            const modal = new QuotaModal(tui, theme, keys, done, {
              inspect: async (inspectionSignal) => {
                let managementKey: string | undefined;
                try { managementKey = resolveManagementKey(configPath); }
                catch (error) { throw new QuotaInspectionError(errorMessage(error)); }
                if (!managementKey) throw new QuotaInspectionError("Set CLIPROXYAPI_MANAGEMENT_KEY or managementKey in cliproxyapi.json to inspect quota.");
                const signal = AbortSignal.any([inspectionSignal, lifetime.signal]);
                return loadQuotaSnapshot({ baseUrl: endpoints.inferenceBaseUrl, managementKey, signal });
              },
            });
            interaction.modal = modal;
            if (interaction.closed) modal.close();
            return modal;
          }, { overlay: true, overlayOptions: { width: "90%", maxHeight: "85%", anchor: "center", margin: 1 } });
        } finally {
          interaction.modal?.dispose();
          if (inspector === interaction) inspector = undefined;
        }
        return;
      }
      const command = new AbortController();
      quotaCommands.add(command);
      try {
        const managementKey = resolveManagementKey(configPath);
        if (!managementKey) {
          ctx.ui.notify("Set CLIPROXYAPI_MANAGEMENT_KEY or managementKey in cliproxyapi.json to inspect quota.", "error");
          return;
        }
        const signal = AbortSignal.any([command.signal, lifetime.signal, ...(ctx.signal ? [ctx.signal] : [])]);
        const snapshot = await loadQuotaSnapshot({ baseUrl: endpoints.inferenceBaseUrl, managementKey, signal });
        if (!signal.aborted) ctx.ui.notify(formatQuotaSnapshot(snapshot), "info");
      } catch (error) {
        if (!command.signal.aborted && !lifetime.signal.aborted && !ctx.signal?.aborted) {
          // The quota client reports sanitized errors and never includes provider response bodies.
          ctx.ui.notify(`Quota inspection failed: ${errorMessage(error)}`, "error");
        }
      } finally {
        quotaCommands.delete(command);
      }
    },
  });

  pi.registerCommand("quota-resume", {
    description: "Toggle automatic quota waiting (/quota-resume [on|off|status])",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "status") {
        ctx.ui.notify(`Automatic quota resume is ${quotaResume ? "enabled" : "disabled"}.`, "info");
        return;
      }
      if (action && action !== "on" && action !== "off") {
        ctx.ui.notify("Usage: /quota-resume [on|off|status]", "error");
        return;
      }
      const enabled = action ? action === "on" : !quotaResume;
      try {
        if (enabled && !resolveManagementKey(configPath)) {
          ctx.ui.notify("Set CLIPROXYAPI_MANAGEMENT_KEY before enabling automatic quota resume.", "error");
          return;
        }
        saveQuotaResumeSetting(configPath, enabled);
      } catch (error) {
        ctx.ui.notify(`Failed to save quota resume: ${errorMessage(error)}`, "error");
        return;
      }
      quotaResume = enabled;
      if (!enabled) quotaRequests.cancelWaiting();
      activeContext = ctx;
      updateQuotaStatus(ctx);
      ctx.ui.notify(enabled
        ? "Automatic quota resume enabled. Escape or /quota-resume off cancels a wait."
        : "Automatic quota resume disabled. Pending quota waits are cancelled.", "info");
    },
  });

  pi.registerCommand("fast", {
    description: `Toggle ${PROVIDER_NAME} Fast mode (priority processing)`,
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /fast (no arguments)", "error");
        return;
      }
      const enabled = !fast;
      try {
        saveFastSetting(configPath, enabled);
      } catch (error) {
        ctx.ui.notify(`Failed to save Fast mode: ${errorMessage(error)}`, "error");
        return;
      }
      fast = enabled;
      // Reuse catalog data so the toggle also works while the proxy is offline.
      if (modelDefinitions.length > 0) register(modelDefinitions);
      activeContext = ctx;
      updateFastStatus(ctx);
      pi.events.emit(MODEL_CATALOG_REFRESHED_EVENT, { provider: PROVIDER_ID });
      if (enabled && !isFastEffective(ctx.model)) {
        ctx.ui.notify("Fast mode is enabled globally, but the current model does not support it.", "warning");
      } else if (!enabled && (ctx.model?.provider !== PROVIDER_ID || !fastModelIds.has(ctx.model.id))) {
        ctx.ui.notify("Fast mode is disabled globally.", "info");
      }
    },
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
