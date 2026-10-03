import { type AssistantMessage, type AssistantMessageEventStream, type Model, type ModelCost, type SimpleStreamOptions, type TranscriptContext, calculateCost, isRetryableAssistantError, lazyStream } from "@earendil-works/pi-ai";
// Pi's bundled runtime maps /compat, but not individual /api modules.
import { openAIResponsesApi } from "@earendil-works/pi-ai/compat";
import { readPauseSetting } from "./config.ts";
import { asRecord, PROVIDER_ID } from "./shared.ts";

const PAUSE_POLL_INTERVAL_MS = 200;

// Proxy stream failures that pi-ai's retry pattern does not cover.
const TRANSIENT_STREAM_ERROR_PATTERN =
  /closed network connection|stream disconnected before completion: stream closed before response\.completed|invalid SSE data JSON/i;

const NETWORK_ERROR_PREFIX = "network error: ";

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

// --- Responses pricing

type ModelPrices = { standard: ModelCost; fast?: ModelCost };

/** Delegate the wire protocol to Pi and replace its guessed tier multiplier with catalog prices. */

export function streamWithCatalogPricing(
  model: Model<"openai-responses">,
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  getPrices: () => ModelPrices,
): AssistantMessageEventStream {
  const requestModel = { ...model, cost: structuredClone(model.cost) };
  let prices = getPrices();
  let requestedPriority = false;
  let responsePriority: boolean | undefined;
  return lazyStream(requestModel, async () => {
    const source = openAIResponsesApi().streamSimple(requestModel, context, {
      ...options,
      onPayload: async (payload, payloadModel) => {
        const replacement = await options?.onPayload?.(payload, payloadModel);
        const tier = asRecord(replacement ?? payload)?.service_tier;
        requestedPriority = tier === "priority" || tier === "fast";
        // The request can wait behind /pause while /fast or the catalog changes.
        prices = getPrices();
        return replacement;
      },
      onProviderStreamEvent: async (event, payloadModel) => {
        const data = asRecord(event);
        if (["response.completed", "response.done", "response.incomplete", "response.failed"].includes(String(data?.type))) {
          const tier = asRecord(data?.response)?.service_tier;
          if (typeof tier === "string") responsePriority = tier === "priority" || tier === "fast";
        }
        await options?.onProviderStreamEvent?.(event, payloadModel);
      },
    });
    return (async function* () {
      for await (const event of source) {
        const message = event.type === "done" ? event.message : event.type === "error" ? event.error : undefined;
        if (message) {
          const priority = responsePriority ?? requestedPriority;
          // Retain Pi's non-priority tier adjustments, such as Flex discounts.
          const nativeBase = calculateCost(requestModel, {
            ...message.usage,
            cost: { ...message.usage.cost },
          }).total;
          const multiplier = !priority && nativeBase > 0 ? message.usage.cost.total / nativeBase : 1;
          const cost = calculateCost({
            ...requestModel,
            cost: priority ? prices.fast ?? prices.standard : prices.standard,
          }, message.usage);
          cost.input *= multiplier;
          cost.output *= multiplier;
          cost.cacheRead *= multiplier;
          cost.cacheWrite *= multiplier;
          cost.total = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
        }
        yield event;
      }
    })();
  });
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
