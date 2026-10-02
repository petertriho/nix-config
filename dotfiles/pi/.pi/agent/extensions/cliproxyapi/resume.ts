import { setTimeout as delay } from "node:timers/promises";
import {
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
  lazyStream,
} from "@earendil-works/pi-ai";
import type { QuotaAvailability } from "./quota.ts";

const QUOTA_CODES = new Set(["usage_limit_reached", "subscription_sharing_usage_limit_exceeded"]);
const MAX_ERROR_BYTES = 64 * 1024;
const MAX_WAIT_MS = 8 * 24 * 60 * 60 * 1000;

export type QuotaErrorHint = { kind: "quota" | "cooldown"; resetAt?: number };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function positive(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

/** Bare 429s, billing failures, and account-auth failures do not establish subscription exhaustion. */
export function quotaErrorHint(value: unknown, now = Date.now()): QuotaErrorHint | undefined {
  if (typeof value === "string") {
    if (value.length > MAX_ERROR_BYTES) return undefined;
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const hint = quotaErrorHint(JSON.parse(value.slice(start, end + 1)), now);
        if (hint) return hint;
      } catch {
        // Pi can report a code without retaining the structured provider error.
      }
    }
    if (/\b(?:usage_limit_reached|subscription_sharing_usage_limit_exceeded)\b/i.test(value)) return { kind: "quota" };
    if (/\bmodel_cooldown\b/i.test(value)) return { kind: "cooldown" };
    return undefined;
  }
  const root = record(value);
  if (!root) return undefined;
  const error = record(root.error) ?? record(record(root.response)?.error) ?? root;
  const codes = [error.code, error.type].filter((code): code is string => typeof code === "string").map((code) => code.toLowerCase());
  const kind = codes.some((code) => QUOTA_CODES.has(code)) ? "quota" : codes.includes("model_cooldown") ? "cooldown" : undefined;
  if (!kind) return undefined;
  const absolute = positive(error.resets_at);
  const seconds = positive(error.resets_in_seconds) ?? (kind === "cooldown" ? positive(error.reset_seconds) : undefined);
  const resetAt = absolute !== undefined ? absolute * 1000 : seconds !== undefined ? now + seconds * 1000 : undefined;
  return { kind, ...(resetAt !== undefined && Number.isFinite(resetAt) ? { resetAt } : {}) };
}

async function responseQuotaHint(response: Response, signal: AbortSignal): Promise<QuotaErrorHint | undefined> {
  if (response.status !== 429 || !response.body || signal.aborted) return undefined;
  const reader = response.clone().body!.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Quota error inspection timed out")), 1000);
    abort = () => reject(new Error("Quota error inspection aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ERROR_BYTES) return undefined;
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return quotaErrorHint(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    // Inspection must not replace the adapter's authoritative response or failure.
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
    // Awaiting cancellation of a cloned branch can deadlock until the adapter reads the original.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type QuotaOperation = {
  signal: AbortSignal;
  waiting: boolean;
  finish(): void;
};

/** Own only active operations. No timer or request starts during extension discovery. */
export class QuotaResumeController {
  private operations = new Map<QuotaOperation, AbortController>();

  begin(signal?: AbortSignal): QuotaOperation {
    const controller = new AbortController();
    const operation: QuotaOperation = {
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      waiting: false,
      finish: () => { this.operations.delete(operation); },
    };
    this.operations.set(operation, controller);
    return operation;
  }

  cancelWaiting(): void {
    for (const [operation, controller] of this.operations) {
      if (operation.waiting) controller.abort();
    }
  }

  cancelAll(): void {
    for (const controller of this.operations.values()) controller.abort();
  }
}

export type QuotaResumeHooks = {
  enabled(): boolean;
  controller: QuotaResumeController;
  stream(options: SimpleStreamOptions | undefined): AssistantMessageEventStream;
  inspect(signal: AbortSignal, hint: QuotaErrorHint): Promise<QuotaAvailability>;
  beforeRetry(signal: AbortSignal): Promise<void>;
  isCurrent(): boolean;
  onWait(resetAt: number | undefined): void;
  onNotice(message: string): void;
  /** Shorter values let tests cover resets without waiting for real subscription windows. */
  timing?: { now?: () => number; tickMs?: number; safetyMs?: number; maxRetries?: number; maxChecks?: number };
};

function cancelled(message: AssistantMessage): AssistantMessageEvent {
  return { type: "error", reason: "aborted", error: { ...message, stopReason: "aborted", errorMessage: "Quota wait cancelled" } };
}

function quotaStopped(message: AssistantMessage): AssistantMessageEvent {
  // Pi's outer retry policy must not restart a quota wait after its safety limit stops it.
  return { type: "error", reason: "error", error: { ...message,
    errorMessage: `quota exceeded: automatic quota resume stopped. ${message.errorMessage ?? "Run /quota before retrying."}`,
  } };
}

/** Keep one assistant operation and its session identity. Never replay partially emitted output. */
export function streamWithQuotaResume(
  model: Model<"openai-responses">,
  options: SimpleStreamOptions | undefined,
  hooks: QuotaResumeHooks,
): AssistantMessageEventStream {
  if (!hooks.enabled()) return hooks.stream(options);
  return lazyStream(model, async () => (async function* () {
    const operation = hooks.controller.begin(options?.signal);
    const now = hooks.timing?.now ?? Date.now;
    const tickMs = hooks.timing?.tickMs ?? 1000;
    const safetyMs = hooks.timing?.safetyMs ?? 2000;
    const maxRetries = hooks.timing?.maxRetries ?? 3;
    const maxChecks = hooks.timing?.maxChecks ?? 3;
    const deadline = now() + MAX_WAIT_MS;
    let immediateRetry = false;
    const current = () => !operation.signal.aborted && hooks.enabled() && hooks.isCurrent();
    try {
      for (let attempt = 0; ; attempt++) {
        let hint: QuotaErrorHint | undefined;
        let start: Extract<AssistantMessageEvent, { type: "start" }> | undefined;
        let emitted = false;
        const fetchImpl = options?.fetch ?? globalThis.fetch;
        const source = hooks.stream({
          ...options,
          signal: operation.signal,
          fetch: async (input, init) => {
            const response = await fetchImpl(input, init);
            hint = await responseQuotaHint(response, operation.signal) ?? hint;
            return response;
          },
          onProviderStreamEvent: async (event, payloadModel) => {
            hint = quotaErrorHint(event, now()) ?? hint;
            await options?.onProviderStreamEvent?.(event, payloadModel);
          },
        });
        let retry = false;
        for await (const event of source) {
          if (event.type === "start") {
            start = event;
            continue;
          }
          if (event.type !== "error") {
            if (start) { yield start; start = undefined; }
            emitted = true;
            yield event;
            continue;
          }
          hint ??= quotaErrorHint(event.error.errorMessage, now());
          const usage = event.error.usage;
          const empty = event.error.content.length === 0
            && [usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.totalTokens, usage.cost.total].every((count) => count === 0);
          if (!hint || emitted || !empty || event.reason === "aborted" || !current()) {
            if (start) yield start;
            yield hint?.kind === "quota" && event.reason !== "aborted" && current() && (emitted || !empty)
              ? quotaStopped(event.error) : event;
            return;
          }
          if (attempt >= maxRetries) {
            if (start) yield start;
            hooks.onNotice("Automatic quota resume stopped: the retry limit was reached. Run /quota before retrying.");
            yield quotaStopped(event.error);
            return;
          }
          operation.waiting = true;
          try {
            let availability = await hooks.inspect(operation.signal, hint);
            if (!current()) { yield cancelled(event.error); return; }
            if (availability.kind === "unknown") {
              hooks.onNotice(`Automatic quota resume stopped: ${availability.reason}`);
              yield hint.kind === "quota" ? quotaStopped(event.error) : event;
              return;
            }
            if (availability.kind === "ready") {
              // A proxy retry budget can end before it reaches a ready account. Give routing one more attempt.
              if (hint.kind !== "quota") { yield event; return; }
              if (immediateRetry) { yield quotaStopped(event.error); return; }
              immediateRetry = true;
            } else {
              let recovered = false;
              for (let check = 0; check < maxChecks; check++) {
                // A cooldown error describes the whole pool. A raw quota error describes only its failed account.
                const resetAt = Math.max(availability.resetAt, hint.kind === "cooldown" ? hint.resetAt ?? 0 : 0) + safetyMs;
                if (!Number.isFinite(resetAt) || resetAt <= now() || resetAt > deadline) break;
                while (current() && now() < resetAt) {
                  hooks.onWait(resetAt);
                  await delay(Math.max(1, Math.min(tickMs, resetAt - now())), undefined, { signal: operation.signal });
                }
                if (!current()) { yield cancelled(event.error); return; }
                availability = await hooks.inspect(operation.signal, { kind: "quota" });
                if (!current()) { yield cancelled(event.error); return; }
                if (availability.kind === "ready") { recovered = true; break; }
                if (availability.kind === "unknown") break;
                // Each new wait must come from a fresh quota probe, not an expired error hint.
                hint = { kind: "quota" };
              }
              if (!recovered) {
                hooks.onNotice("Automatic quota resume stopped: quota recovery could not be verified. Run /quota, then retry manually.");
                yield quotaStopped(event.error);
                return;
              }
            }
            hooks.onWait(undefined);
            await hooks.beforeRetry(operation.signal);
            if (!current()) { yield cancelled(event.error); return; }
            operation.waiting = false;
            hooks.onNotice("Quota is available. Retrying the pending request with the same session identity.");
            retry = true;
          } catch {
            if (!current()) { yield cancelled(event.error); return; }
            hooks.onNotice("Automatic quota resume stopped: the management API could not verify quota. Run /quota for details.");
            yield hint.kind === "quota" ? quotaStopped(event.error) : event;
            return;
          } finally {
            hooks.onWait(undefined);
            operation.waiting = false;
          }
        }
        if (!retry) return;
      }
    } finally {
      hooks.onWait(undefined);
      operation.finish();
    }
  })());
}

export function formatQuotaWait(resetAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.ceil((resetAt - now) / 1000));
  const remaining = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.ceil(seconds / 60)}m`
    : seconds < 86400 ? `${Math.ceil(seconds / 3600)}h` : `${Math.ceil(seconds / 86400)}d`;
  const time = new Date(resetAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `quota wait ${time} (${remaining})`;
}
