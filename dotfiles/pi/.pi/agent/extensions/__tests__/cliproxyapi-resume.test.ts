import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { type AssistantMessage, type AssistantMessageEvent, type Model, type SimpleStreamOptions, isRetryableAssistantError, lazyStream } from "@earendil-works/pi-ai";
import { formatQuotaWait, quotaErrorHint, QuotaResumeController, type QuotaResumeHooks, streamWithQuotaResume } from "../pi-cliproxyapi-provider/resume.ts";
import { hasConfirmedQuotaExhaustion, type QuotaSnapshot } from "../pi-cliproxyapi-provider/quota.ts";

const model: Model<"openai-responses"> = {
  id: "gpt-test", name: "Test", provider: "cliproxyapi", api: "openai-responses", baseUrl: "http://localhost/v1",
  reasoning: false, input: ["text"], contextWindow: 16000, maxTokens: 1000,
  cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
};

function message(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant", content: [], api: "openai-responses", provider: "cliproxyapi", model: model.id, timestamp: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "error", errorMessage: "429 usage_limit_reached", ...overrides,
  };
}

const failure = (error = message()): AssistantMessageEvent => ({ type: "error", reason: "error", error });
const success = (): AssistantMessageEvent[] => {
  const final = message({ stopReason: "stop", errorMessage: undefined, content: [{ type: "text", text: "done" }] });
  return [{ type: "start", partial: final }, { type: "done", reason: "stop", message: final }];
};

function harness(overrides: Partial<QuotaResumeHooks> = {}) {
  const requests: Array<SimpleStreamOptions | undefined> = [];
  const waits: Array<number | undefined> = [];
  const notices: string[] = [];
  const hooks: QuotaResumeHooks = {
    enabled: () => true,
    controller: new QuotaResumeController(),
    stream: (options) => {
      requests.push(options);
      const events = requests.length === 1 ? [failure()] : success();
      return lazyStream(model, async () => (async function* () { yield* events; })());
    },
    inspect: async () => ({ kind: "ready" }),
    beforeRetry: async () => {},
    isCurrent: () => true,
    onWait: (resetAt) => { waits.push(resetAt); },
    onNotice: (notice) => { notices.push(notice); },
    timing: { tickMs: 2, safetyMs: 0 },
    ...overrides,
  };
  return { hooks, requests, waits, notices };
}

async function collect(stream: AsyncIterable<AssistantMessageEvent>) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function scripted(events: AssistantMessageEvent[]) {
  return lazyStream(model, async () => (async function* () { yield* events; })());
}

test("quota classification requires a subscription quota code or a pool cooldown code", () => {
  assert.deepEqual(quotaErrorHint({ error: { type: "usage_limit_reached", resets_at: 500 } }, 1000), { kind: "quota", resetAt: 500000 });
  assert.deepEqual(quotaErrorHint({ error: { code: "usage_limit_reached", resets_in_seconds: 3 } }, 1000), { kind: "quota", resetAt: 4000 });
  assert.deepEqual(quotaErrorHint({ error: { code: "model_cooldown", reset_seconds: "3" } }, 1000), { kind: "cooldown", resetAt: 4000 });
  assert.deepEqual(quotaErrorHint({ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } }), { kind: "quota" });
  assert.deepEqual(quotaErrorHint('429 {"error":{"code":"model_cooldown","reset_seconds":4}}', 1000), { kind: "cooldown", resetAt: 5000 });
  for (const error of ["429 Too Many Requests", "quota exceeded", "insufficient_quota", "billing", "401 expired_token", {}, null,
    { error: { code: "rate_limit_exceeded" } }, "x".repeat(65537)]) {
    assert.equal(quotaErrorHint(error), undefined);
  }
});

test("disabled quota resume delegates the original options without inspecting or wrapping", async () => {
  const options = { sessionId: "sticky-session", headers: { "X-Pi-Session-Id": "sticky-session" } };
  const h = harness({ enabled: () => false, inspect: async () => { throw new Error("must not probe"); } });
  await collect(streamWithQuotaResume(model, options, h.hooks));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0], options);
  assert.equal(h.waits.length, 0);
});

test("a ready alternative gets one immediate retry with the same session identity and options", async () => {
  const h = harness();
  const callback = () => {};
  const options = { sessionId: "sticky-session", env: { PROVIDER_SCOPE: "keep" }, headers: { "X-Pi-Session-Id": "sticky-session" },
    apiKey: "private-key", onResponse: callback, onPayload: (payload: unknown) => payload };
  const events = await collect(streamWithQuotaResume(model, options, h.hooks));
  assert.deepEqual(events.map((event) => event.type), ["start", "done"]);
  assert.equal(h.requests.length, 2);
  for (const request of h.requests) {
    assert.equal(request?.sessionId, options.sessionId);
    assert.equal(request?.env, options.env);
    assert.equal(request?.headers, options.headers);
    assert.equal(request?.apiKey, options.apiKey);
    assert.equal(request?.onResponse, callback);
    assert.equal(request?.onPayload, options.onPayload);
  }
});

test("all exhausted accounts wait until the pool reset, not the failed sticky account reset", async () => {
  let probes = 0;
  const resetAt = Date.now() + 35;
  const h = harness({ inspect: async () => ++probes === 1 ? { kind: "wait", resetAt } : { kind: "ready" } });
  const original = h.hooks.stream;
  h.hooks.stream = (options) => {
    if (h.requests.length === 0) {
      h.requests.push(options);
      return scripted([failure(message({ errorMessage: JSON.stringify({ error: { type: "usage_limit_reached", resets_at: (Date.now() + 3600000) / 1000 } }) }))]);
    }
    return original(options);
  };
  const events = await collect(streamWithQuotaResume(model, { sessionId: "same-session" }, h.hooks));
  assert.equal(probes, 2);
  assert.equal(h.requests.length, 2);
  assert.ok(Date.now() >= resetAt);
  assert.ok(h.waits.includes(resetAt));
  assert.equal(events.at(-1)?.type, "done");
  assert.equal(h.waits.at(-1), undefined);
});

test("the proxy's pool cooldown is a floor for the live pool reset", async () => {
  const now = Date.now();
  let probes = 0;
  const h = harness({ inspect: async () => ++probes === 1 ? { kind: "wait", resetAt: now + 5 } : { kind: "ready" } });
  h.hooks.stream = (options) => {
    h.requests.push(options);
    return scripted(h.requests.length === 1 ? [failure(message({ errorMessage: JSON.stringify({ error: { code: "model_cooldown", reset_seconds: 0.035 } }) }))] : success());
  };
  await collect(streamWithQuotaResume(model, {}, h.hooks));
  assert.ok(h.waits.some((at) => at !== undefined && at >= now + 35));
  assert.equal(h.requests.length, 2);
});

test("unknown account availability preserves the failure and does not schedule a retry", async () => {
  const h = harness({ inspect: async () => ({ kind: "unknown", reason: "model eligibility is unknown" }) });
  const events = await collect(streamWithQuotaResume(model, {}, h.hooks));
  assert.equal(h.requests.length, 1);
  assert.equal(events.at(-1)?.type, "error");
  assert.ok(h.notices.some((notice) => notice.includes("eligibility")));
  assert.equal(h.waits.some((at) => at !== undefined), false);
});

test("a ready pool does not authorize retry of a generic cooldown", async () => {
  const h = harness();
  h.hooks.stream = () => scripted([failure(message({ errorMessage: "model_cooldown" }))]);
  const events = await collect(streamWithQuotaResume(model, {}, h.hooks));
  assert.equal(events.at(-1)?.type, "error");
  assert.equal(h.notices.length, 0);
});

test("missing, expired, non-finite, or implausibly distant reset times do not create a timer", async () => {
  for (const resetAt of [NaN, Infinity, Date.now() - 100, Date.now() + 9 * 86400000]) {
    const h = harness({ inspect: async () => ({ kind: "wait", resetAt }) });
    const events = await collect(streamWithQuotaResume(model, {}, h.hooks));
    assert.equal(h.requests.length, 1);
    assert.equal(events.at(-1)?.type, "error");
    assert.equal(h.waits.some((at) => at !== undefined), false);
  }
});

test("an empty failed start is held back so recovery emits exactly one successful start", async () => {
  const h = harness();
  h.hooks.stream = (options) => {
    h.requests.push(options);
    return scripted(h.requests.length === 1 ? [{ type: "start", partial: message({ stopReason: "pending" }) }, failure()] : success());
  };
  const events = await collect(streamWithQuotaResume(model, {}, h.hooks));
  assert.deepEqual(events.map((event) => event.type), ["start", "done"]);
});

test("partially emitted text, thinking, or tool calls are never replayed", async () => {
  for (const type of ["text_start", "thinking_start", "toolcall_start"] as const) {
    let probes = 0;
    const partial = message({ stopReason: "pending" });
    const h = harness({ inspect: async () => { probes++; return { kind: "ready" }; } });
    h.hooks.stream = () => scripted([{ type: "start", partial }, { type, contentIndex: 0, partial }, failure()]);
    const events = await collect(streamWithQuotaResume(model, {}, h.hooks));
    assert.deepEqual(events.map((event) => event.type), ["start", type, "error"]);
    assert.equal(probes, 0);
  }
});

test("retained content or charged tokens prevent retry even without forwarded deltas", async () => {
  const charged = (["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const).map((field) => {
    const result = message();
    result.usage[field] = 1;
    return result;
  });
  const cost = message();
  cost.usage.cost.total = 1;
  for (const failed of [...charged, cost, message({ content: [{ type: "text", text: "partial" }] })]) {
    let probes = 0;
    const h = harness({ stream: () => scripted([failure(failed)]), inspect: async () => { probes++; return { kind: "ready" }; } });
    const last = (await collect(streamWithQuotaResume(model, {}, h.hooks))).at(-1);
    assert.equal(last?.type, "error");
    if (last?.type === "error") assert.equal(isRetryableAssistantError(last.error), false);
    assert.equal(probes, 0);
  }
});

test("normal transient errors and aborted requests remain outside the quota scheduler", async () => {
  for (const event of [failure(message({ errorMessage: "429 rate_limit_exceeded" })),
    { type: "error", reason: "aborted", error: message({ stopReason: "aborted" }) } as AssistantMessageEvent,
    { type: "error", reason: "aborted", error: message({ stopReason: "aborted", content: [{ type: "text", text: "partial" }] }) } as AssistantMessageEvent]) {
    let probes = 0;
    const h = harness({ stream: () => scripted([event]), inspect: async () => { probes++; return { kind: "ready" }; } });
    assert.deepEqual(await collect(streamWithQuotaResume(model, {}, h.hooks)), [event]);
    assert.equal(probes, 0);
  }
});

test("abort, disabling, session changes, and controller cleanup cancel a wait without another request", async () => {
  for (const reason of ["signal", "off", "changed", "cleanup", "new work"] as const) {
    let enabled = true;
    let current = true;
    const signal = new AbortController();
    const h = harness({ enabled: () => enabled, isCurrent: () => current,
      inspect: async () => ({ kind: "wait", resetAt: Date.now() + 60000 }) });
    const result = collect(streamWithQuotaResume(model, { signal: signal.signal }, h.hooks));
    while (!h.waits.some((at) => at !== undefined)) await delay(1);
    if (reason === "signal") signal.abort();
    if (reason === "off") enabled = false;
    if (reason === "changed") current = false;
    if (reason === "cleanup") h.hooks.controller.cancelAll();
    if (reason === "new work") h.hooks.controller.cancelWaiting();
    const events = await result;
    const last = events.at(-1);
    assert.equal(last?.type, "error");
    if (last?.type === "error") assert.equal(last.reason, "aborted");
    assert.equal(h.requests.length, 1);
    assert.equal(h.waits.at(-1), undefined);
  }
});

test("manual pause remains an independent gate after quota recovery", async () => {
  let release!: () => void;
  let paused = false;
  const h = harness({ beforeRetry: async () => { paused = true; await new Promise<void>((resolve) => { release = resolve; }); } });
  const result = collect(streamWithQuotaResume(model, {}, h.hooks));
  while (!paused) await delay(1);
  assert.equal(h.requests.length, 1);
  release();
  assert.equal((await result).at(-1)?.type, "done");
  assert.equal(h.requests.length, 2);
});

test("management errors stop with a generic notice instead of exposing secret-bearing exceptions", async () => {
  const h = harness({ inspect: async () => { throw new Error("Bearer private-management-token"); } });
  assert.equal((await collect(streamWithQuotaResume(model, {}, h.hooks))).at(-1)?.type, "error");
  assert.equal(h.requests.length, 1);
  assert.doesNotMatch(h.notices.join("\n"), /private-management-token|Bearer/);
});

test("a still-ready pool grants only one immediate retry", async () => {
  const h = harness();
  h.hooks.stream = (options) => { h.requests.push(options); return scripted([failure()]); };
  assert.equal((await collect(streamWithQuotaResume(model, {}, h.hooks))).at(-1)?.type, "error");
  assert.equal(h.requests.length, 2);
});

test("new resets are rechecked and bounded before restoring the failed request", async () => {
  let probes = 0;
  const h = harness({ inspect: async () => { probes++; return { kind: "wait", resetAt: Date.now() + 5 }; }, timing: { tickMs: 1, safetyMs: 0, maxChecks: 2 } });
  assert.equal((await collect(streamWithQuotaResume(model, {}, h.hooks))).at(-1)?.type, "error");
  assert.equal(probes, 3);
  assert.equal(h.requests.length, 1);
});

test("quota safety stops cannot be restarted by Pi's normal transient retry policy", async () => {
  for (const inspect of [
    async () => ({ kind: "unknown" as const, reason: "unknown eligibility" }),
    async () => { throw new Error("management unavailable"); },
    async () => ({ kind: "wait" as const, resetAt: NaN }),
    async () => ({ kind: "ready" as const }),
  ]) {
    const h = harness({ inspect });
    h.hooks.stream = (options) => { h.requests.push(options); return scripted([failure()]); };
    const last = (await collect(streamWithQuotaResume(model, {}, h.hooks))).at(-1);
    assert.equal(last?.type, "error");
    if (last?.type === "error") {
      assert.equal(isRetryableAssistantError(last.error), false);
      assert.match(last.error.errorMessage!, /usage_limit_reached/);
    }
    assert.ok(h.requests.length <= 2);
  }
});

test("HTTP quota inspection preserves response consumption and the caller's fetch", async () => {
  let calls = 0;
  let bodyReads = 0;
  const options: SimpleStreamOptions = { fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ error: { type: "usage_limit_reached", resets_in_seconds: 1 } }), { status: 429 });
  } };
  const h = harness();
  h.hooks.stream = (requestOptions) => {
    h.requests.push(requestOptions);
    return lazyStream(model, async () => (async function* () {
      if (h.requests.length === 1) {
        const response = await requestOptions!.fetch!("http://localhost/v1/responses");
        assert.equal(response.status, 429);
        assert.match(await response.text(), /usage_limit_reached/);
        bodyReads++;
        yield failure(message({ errorMessage: "429 API error" }));
      } else yield* success();
    })());
  };
  assert.equal((await collect(streamWithQuotaResume(model, options, h.hooks))).at(-1)?.type, "done");
  assert.equal(calls, 1);
  assert.equal(bodyReads, 1);
});

test("HTTP error inspection has a deadline and does not consume the original response", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    upstream = controller;
    controller.enqueue(new TextEncoder().encode("{\"error\":{\"type\":\"usage_limit_reached\"}}"));
  } }), { status: 429 });
  let probes = 0;
  const h = harness({ inspect: async () => { probes++; return { kind: "ready" }; } });
  h.hooks.stream = (options) => lazyStream(model, async () => (async function* () {
    const original = await options!.fetch!("http://localhost/v1/responses");
    assert.equal(original, response);
    assert.equal(original.bodyUsed, false);
    yield failure(message({ errorMessage: "429 API error" }));
  })());
  const pending = collect(streamWithQuotaResume(model, { fetch: async () => response }, h.hooks));
  await new Promise<void>((resolve) => setImmediate(resolve));
  context.mock.timers.tick(1000);
  try {
    assert.equal((await pending).at(-1)?.type, "error");
    assert.equal(probes, 0);
  } finally { upstream.close(); }
});

test("a recovered pool still respects the limit on quota retries", async () => {
  let probes = 0;
  const h = harness({ inspect: async () => ++probes % 2 ? { kind: "wait", resetAt: Date.now() + 5 } : { kind: "ready" },
    timing: { maxRetries: 2, safetyMs: 0, tickMs: 1 } });
  h.hooks.stream = (options) => { h.requests.push(options); return scripted([failure()]); };
  const last = (await collect(streamWithQuotaResume(model, {}, h.hooks))).at(-1);
  assert.equal(last?.type, "error");
  if (last?.type === "error") assert.equal(isRetryableAssistantError(last.error), false);
  assert.equal(h.requests.length, 3);
  assert.equal(probes, 4);
});

test("raw stream quota events are inspected and still reach the instrumentation callback", async () => {
  const observed: unknown[] = [];
  const raw = { type: "response.failed", response: { error: { code: "usage_limit_reached" } } };
  const h = harness();
  h.hooks.stream = (options) => {
    h.requests.push(options);
    return lazyStream(model, async () => (async function* () {
      if (h.requests.length === 1) {
        await options?.onProviderStreamEvent?.(raw, model);
        yield failure(message({ errorMessage: "API error" }));
      } else yield* success();
    })());
  };
  const events = await collect(streamWithQuotaResume(model, { onProviderStreamEvent: (event) => { observed.push(event); } }, h.hooks));
  assert.equal(events.at(-1)?.type, "done");
  assert.deepEqual(observed, [raw]);
});

test("scheduler, review, unrelated-model, and allowed windows do not establish quota exhaustion", () => {
  const snapshot: QuotaSnapshot = { checkedAt: Date.now(), accounts: [{
    authIndex: "a", label: "a", provider: "codex", disabled: false, unavailable: true, eligible: true, allowed: true,
    windows: [
      { label: "Scheduler cooldown", scope: "model", modelId: model.id, limitReached: true },
      { label: "Review", scope: "review", limitReached: true },
      { label: "Additional quota", scope: "model", modelId: "gpt-other", limitReached: true },
      { label: "Generation", scope: "account", usedPercent: 100, allowed: true },
    ],
  }] };
  assert.equal(hasConfirmedQuotaExhaustion(snapshot, model.id), false);
  snapshot.accounts[0].windows.push({ label: "Generation", scope: "account", limitReached: true, allowed: false });
  assert.equal(hasConfirmedQuotaExhaustion(snapshot, model.id), true);
  snapshot.accounts[0].disabled = true;
  assert.equal(hasConfirmedQuotaExhaustion(snapshot, model.id), false);
});

test("quota wait text uses seconds, minutes, hours, and days", () => {
  assert.match(formatQuotaWait(30000, 0), /quota wait .* \(30s\)/);
  assert.match(formatQuotaWait(120000, 0), /\(2m\)/);
  assert.match(formatQuotaWait(7200000, 0), /\(2h\)/);
  assert.match(formatQuotaWait(172800000, 0), /\(2d\)/);
});
