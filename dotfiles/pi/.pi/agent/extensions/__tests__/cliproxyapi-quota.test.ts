import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import * as quota from "../cliproxyapi/quota.ts";
import {
	formatQuotaSnapshot,
	loadQuotaSnapshot,
	quotaAvailability,
	type QuotaAccount,
	type QuotaAvailability,
	type QuotaSnapshot,
	type QuotaWindow,
} from "../cliproxyapi/quota.ts";

type JsonRecord = Record<string, unknown>;
type Call = { url: string; init: RequestInit; body?: JsonRecord };
const NOW = Date.parse("2026-10-02T12:00:00Z");
const KEY = "management-secret-for-tests";
const MODEL = "gpt-5.3-codex";
const SPARK = "gpt-5.3-codex-spark";
const ROOT = "http://proxy.invalid/reverse/proxy";

function json(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function credential(index = "a", overrides: JsonRecord = {}): JsonRecord {
	return {
		auth_index: index,
		name: `account-${index}.json`,
		label: `Account ${index}`,
		provider: "codex",
		type: "codex",
		disabled: false,
		unavailable: false,
		status: "active",
		cooldowns: [],
		id_token: { chatgpt_account_id: `claim-${index}`, plan_type: "pro" },
		...overrides,
	};
}

function usageWindow(used = 10, reset = NOW + 60_000, duration = 18_000): JsonRecord {
	return { used_percent: used, reset_at: reset / 1000, limit_window_seconds: duration };
}

function usage(primary = usageWindow(), secondary?: JsonRecord, flags: JsonRecord = {}): JsonRecord {
	return {
		rate_limit: { primary_window: primary, secondary_window: secondary ?? null, ...flags },
		code_review_rate_limit: null,
		additional_rate_limits: [],
	};
}

function wrapped(payload: unknown = usage(), status = 200): JsonRecord {
	return { status_code: status, body: JSON.stringify(payload) };
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fetchImpl: typeof fetch = async (input, init = {}) => {
		const call: Call = {
			url: String(input),
			init,
			...(typeof init.body === "string" ? { body: JSON.parse(init.body) as JsonRecord } : {}),
		};
		calls.push(call);
		return handler(call);
	};
	return { fetchImpl, calls };
}

function fixture(options: {
	files?: JsonRecord[];
	models?: Record<string, unknown>;
	wrappers?: Record<string, unknown>;
	payload?: unknown;
} = {}) {
	return mockFetch((call) => {
		const url = new URL(call.url);
		assert.equal(new Headers(call.init.headers).get("Authorization"), `Bearer ${KEY}`);
		assert.equal(call.init.redirect, "error");
		assert.ok(call.init.signal);
		assert.equal(call.init.signal.aborted, false);
		if (url.pathname.endsWith("/credentials")) return json({ files: options.files ?? [credential()] });
		if (url.pathname.endsWith("/credentials/models")) {
			const name = url.searchParams.get("name")!;
			return json(options.models?.[name] ?? { models: [{ id: MODEL }, { id: SPARK }] });
		}
		if (url.pathname.endsWith("/requests/api-call")) {
			return json(options.wrappers?.[String(call.body?.auth_index)] ?? wrapped(options.payload ?? usage()));
		}
		assert.fail(`Unexpected fixture route: ${url.pathname}`);
	});
}

async function load(options: Parameters<typeof fixture>[0] = {}, modelId: string | null = MODEL) {
	const mock = fixture(options);
	const snapshot = await loadQuotaSnapshot({ baseUrl: `${ROOT}/v1/`, managementKey: KEY, modelId: modelId ?? undefined, fetchImpl: mock.fetchImpl, now: NOW });
	return { snapshot, calls: mock.calls, account: snapshot.accounts[0] };
}

function account(overrides: Partial<QuotaAccount> = {}): QuotaAccount {
	return {
		authIndex: "a", label: "Account a", provider: "codex", disabled: false, unavailable: false, eligible: true,
		windows: [{ label: "Generation", scope: "account", usedPercent: 10 }], ...overrides,
	};
}

function availability(accounts: QuotaAccount[], now = NOW): QuotaAvailability {
	const snapshot: QuotaSnapshot = { checkedAt: NOW, accounts };
	return quotaAvailability(snapshot, MODEL, now);
}

function exhausted(resetAt?: number, scope: QuotaWindow["scope"] = "account", modelId?: string): QuotaWindow {
	return { label: "Limited", scope, modelId, usedPercent: 100, resetAt };
}

function isUnknown(result: QuotaAvailability): void {
	assert.equal(result.kind, "unknown");
	if (result.kind === "unknown") assert.ok(result.reason.length > 0);
}

// All requests use an injected fetch. No real proxy, account, or credential file is read.
test("exports the quota client and subscription-exhaustion guard", () => {
	assert.deepEqual(Object.keys(quota).sort(), ["formatQuotaSnapshot", "hasConfirmedQuotaExhaustion", "loadQuotaSnapshot", "quotaAvailability"]);
});

test("uses exact v8 management requests, a filename query, parsed claims, and $TOKEN$", async () => {
	const { snapshot, calls, account: result } = await load({ files: [credential("a", { name: "account + space.json" })] });
	assert.equal(snapshot.checkedAt, NOW);
	assert.equal(result.eligible, true);
	assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
		["GET", `${ROOT}/v8/management/credentials`],
		["GET", `${ROOT}/v8/management/credentials/models?name=account+%2B+space.json`],
		["POST", `${ROOT}/v8/management/requests/api-call`],
	]);
	assert.deepEqual(calls[2].body, {
		auth_index: "a", method: "GET", url: "https://chatgpt.com/backend-api/wham/usage",
		header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "Chatgpt-Account-Id": "claim-a" },
	});
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
});

for (const suffix of ["", "/", "/v1", "/v1/"]) {
	test(`preserves reverse-proxy prefix for base URL suffix ${JSON.stringify(suffix)}`, async () => {
		const mock = fixture();
		await loadQuotaSnapshot({ baseUrl: `${ROOT}${suffix}`, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
		assert.equal(mock.calls[0].url, `${ROOT}/v8/management/credentials`);
	});
}

test("root origin URLs do not gain or lose path segments", async () => {
	const mock = fixture();
	await loadQuotaSnapshot({ baseUrl: "https://proxy.invalid/v1", managementKey: KEY, fetchImpl: mock.fetchImpl, now: NOW });
	assert.equal(mock.calls[0].url, "https://proxy.invalid/v8/management/credentials");
	assert.equal(mock.calls.length, 2);
});

test("falls back to each exact v0 route only after management HTTP 404", async () => {
	const mock = mockFetch((call) => {
		if (call.url.includes("/v8/")) return json({ error: "secret should not be read" }, 404);
		if (call.url.endsWith("/auth-files")) return json({ files: [credential()] });
		if (call.url.includes("/auth-files/models?")) return json({ models: [{ id: MODEL }] });
		if (call.url.endsWith("/api-call")) return json(wrapped());
		assert.fail("Unexpected compatibility route");
	});
	const snapshot = await loadQuotaSnapshot({ baseUrl: `${ROOT}/v1`, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
	assert.deepEqual(mock.calls.map((call) => call.url), [
		`${ROOT}/v8/management/credentials`, `${ROOT}/v0/management/auth-files`,
		`${ROOT}/v8/management/credentials/models?name=account-a.json`, `${ROOT}/v0/management/auth-files/models?name=account-a.json`,
		`${ROOT}/v8/management/requests/api-call`, `${ROOT}/v0/management/api-call`,
	]);
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
});

for (const status of [400, 401, 403, 429, 500]) {
	test(`does not fall back on management HTTP ${status}, or expose the response`, async () => {
		const mock = mockFetch(() => new Response(`Authorization: Bearer ${KEY}`, { status }));
		await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, fetchImpl: mock.fetchImpl }), (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.ok(!error.message.includes(KEY));
			return true;
		});
		assert.equal(mock.calls.length, 1);
	});
}

for (const stage of ["credentials/models", "requests/api-call"]) {
	test(`authentication failure at ${stage} never triggers v0 fallback`, async () => {
		const normal = fixture();
		const mock = mockFetch((call) => call.url.includes(stage) ? json({ error: KEY }, 401) : normal.fetchImpl(call.url, call.init));
		const snapshot = await loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
		assert.ok(snapshot.accounts[0].error?.includes("HTTP 401"));
		assert.ok(mock.calls.every((call) => !call.url.includes("/v0/")));
	});
}

for (const status of [302, 401, 403, 404, 429, 500]) {
	test(`validates upstream wrapper status ${status} without fallback or quota-exhaustion inference`, async () => {
		const { snapshot, account: result, calls } = await load({ wrappers: { a: { status_code: status, body: `secret=${KEY}` } } });
		assert.match(result.error!, new RegExp(`HTTP ${status}`));
		assert.ok(!JSON.stringify(snapshot).includes(KEY));
		assert.equal(calls.length, 3);
		assert.ok(calls.every((call) => !call.url.includes("/v0/")));
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	});
}

for (const [name, wrapper] of Object.entries({
	missingStatus: { body: "{}" }, stringStatus: { status_code: "200", body: "{}" },
	badStatus: { status_code: 999, body: "{}" }, fractionalStatus: { status_code: 200.5, body: "{}" },
	missingBody: { status_code: 200 }, objectBody: { status_code: 200, body: usage() },
	badJson: { status_code: 200, body: `invalid ${KEY}` }, nullBody: { status_code: 200, body: "null" },
	arrayBody: { status_code: 200, body: "[]" }, emptyBody: wrapped({}),
})) {
	test(`bad wrapper/payload ${name} is unknown with a generic error`, async () => {
		const { snapshot, account: result } = await load({ wrappers: { a: wrapper } });
		assert.match(result.error!, /Invalid quota response/);
		assert.ok(!JSON.stringify(snapshot).includes(KEY));
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	});
}

for (const payload of [
	usage({ used_percent: "secret" }), usage({ used_percent: -1 }), usage({ used_percent: 20, reset_at: "tomorrow" }),
	usage({ used_percent: 20, reset_at: 1e300 }), usage({}, undefined, { allowed: true }),
	usage(usageWindow(), undefined, { allowed: "yes" }), usage(usageWindow(), undefined, { limit_reached: "no" }),
	usage(usageWindow(), undefined, { allowed: true, limit_reached: true }),
	{ ...usage(), additional_rate_limits: {} }, { ...usage(), additional_rate_limits: [null] },
	{ ...usage(), credits: { has_credits: "yes" } },
]) {
	test(`malformed quota fields cannot authorize readiness (${JSON.stringify(payload).slice(0, 90)})`, async () => {
		const { snapshot, account: result } = await load({ payload });
		assert.ok(result.error);
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	});
}

test("invalid credentials list is a generic top-level error, not an empty ready pool", async () => {
	for (const listing of [{}, { files: null }, { files: [null] }, { files: [{ name: "unknown-provider" }] }]) {
		const mock = mockFetch(() => json(listing));
		await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, fetchImpl: mock.fetchImpl }), /Invalid quota response/);
	}
	const mock = mockFetch(() => new Response(`not JSON ${KEY}`));
	await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, fetchImpl: mock.fetchImpl }), /Invalid quota response/);
});

test("model eligibility comes only from the per-credential models list", async () => {
	const { snapshot, calls } = await load({ models: { "account-a.json": { models: [{ id: SPARK }] } } });
	assert.equal(snapshot.accounts[0].eligible, false);
	assert.equal(calls.length, 2);
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("an empty models list is verified ineligibility and is not probed", async () => {
	const { snapshot, calls } = await load({ models: { "account-a.json": { models: [] } } });
	assert.equal(snapshot.accounts[0].eligible, false);
	assert.equal(calls.length, 2);
});

for (const models of [{}, { models: null }, { models: ["gpt-5.3-codex"] }, { models: [{ id: MODEL }, {}] }]) {
	test(`invalid model list remains unknown (${JSON.stringify(models)})`, async () => {
		const { snapshot, account: result, calls } = await load({ models: { "account-a.json": models } });
		assert.equal(result.eligible, "unknown");
		assert.ok(result.error);
		assert.equal(calls.length, 2);
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	});
}

test("without modelId it still probes live quota, but cannot authorize any model", async () => {
	const { snapshot, calls, account: result } = await load({}, null);
	assert.equal(result.eligible, "unknown");
	assert.equal(calls.length, 2);
	assert.equal(result.windows.length, 1);
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("eligibility cannot be reused for a different model", async () => {
	const { snapshot } = await load();
	isUnknown(quotaAvailability(snapshot, SPARK, NOW));
});

test("requires exact registry model IDs, not family or case/prefix guesses", async () => {
	const { account: result, calls } = await load({ models: { "account-a.json": { models: [{ id: MODEL.toUpperCase() }, { id: `alias/${MODEL}` }] } } });
	assert.equal(result.eligible, false);
	assert.equal(calls.length, 2);
});

test("disabled Codex accounts are displayed but never queried, and other providers are excluded", async () => {
	const { snapshot, calls } = await load({ files: [credential("a", { disabled: true }), credential("b", { status: "disabled" }), credential("c", { provider: "claude" })] });
	assert.equal(snapshot.accounts.length, 2);
	assert.equal(calls.length, 1);
	assert.ok(snapshot.accounts.every((item) => item.disabled && !item.windows.length));
	assert.match(formatQuotaSnapshot(snapshot, NOW), /disabled \(not probed\)/);
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("missing state, malformed disabled flags, and duplicate indexes are never probed", async () => {
	const { snapshot, calls } = await load({ files: [credential("a", { disabled: "true" }), credential("b", { unavailable: undefined }), credential("c"), credential("c")] });
	assert.equal(calls.length, 1);
	assert.ok(snapshot.accounts.every((item) => item.error));
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("one exhausted live window yields its actual reset in milliseconds", async () => {
	const reset = NOW + 90_000;
	const { snapshot } = await load({ payload: usage(usageWindow(100, reset), undefined, { allowed: false, limit_reached: true }) });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: reset });
});

test("all exhausted windows block: MAX within each account then MIN across accounts", async () => {
	const { snapshot } = await load({
		files: [credential("a"), credential("b")],
		wrappers: {
			a: wrapped(usage(usageWindow(100, NOW + 60_000), usageWindow(100, NOW + 600_000, 604_800), { allowed: false, limit_reached: true })),
			b: wrapped(usage(usageWindow(100, NOW + 120_000), usageWindow(100, NOW + 300_000, 604_800), { allowed: false, limit_reached: true })),
		},
	});
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 300_000 });
	assert.equal(snapshot.accounts[0].windows.filter((window) => window.limitReached).length, 2);
});

test("aggregate denial does not turn a non-exhausted weekly window into a blocker", async () => {
	const { snapshot } = await load({ payload: usage(usageWindow(100, NOW + 60_000), usageWindow(50, NOW + 600_000), { allowed: false, limit_reached: true }) });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 60_000 });
});

test("denial without percentages includes all possible blocking windows and invents no usage", async () => {
	const { snapshot } = await load({ payload: usage({ reset_at: (NOW + 60_000) / 1000 }, { reset_at: (NOW + 600_000) / 1000 }, { allowed: false }) });
	assert.ok(snapshot.accounts[0].windows.every((window) => window.usedPercent === undefined));
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 600_000 });
});

test("missing or expired blocking resets stay unknown instead of manufacturing a wait/refill", async () => {
	for (const window of [{ used_percent: 100 }, usageWindow(100, NOW), usageWindow(100, NOW - 1)]) {
		const { snapshot } = await load({ payload: usage(window) });
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	}
	isUnknown(availability([account({ windows: [exhausted(NOW + 1000), exhausted()] })]));
	isUnknown(availability([account({ windows: [exhausted(NOW + 1000)] })], NOW + 1001));
});

test("unknown or failing enabled eligible accounts prevent declaring the whole pool exhausted", () => {
	const blocked = account({ windows: [exhausted(NOW + 60_000)] });
	for (const other of [account({ eligible: "unknown" }), account({ error: "upstream failed" }), account({ windows: [] }), account({ unavailable: true })]) {
		isUnknown(availability([blocked, other]));
	}
	assert.deepEqual(availability([blocked, account({ disabled: true, error: "failed" }), account({ eligible: false, error: "failed" })]), { kind: "wait", resetAt: NOW + 60_000 });
});

test("one known ready eligible account can authorize ready despite other unknown/failing accounts", () => {
	assert.deepEqual(availability([account({ eligible: "unknown" }), account({ error: "failed" }), account()]), { kind: "ready" });
	assert.deepEqual(availability([account(), account({ eligible: "unknown" })]), { kind: "ready" });
	isUnknown(availability([]));
});

test("a failed live probe cannot fall back to passive quota observations", async () => {
	const { snapshot } = await load({
		files: [credential("a", { quota: { observed_at: new Date(NOW).toISOString(), signals: { "X-Codex-Primary-Used-Percent": "0" } }, model_quotas: { [MODEL]: { signals: { allowed: "true" } } } })],
		wrappers: { a: { status_code: 401, body: "token expired" } },
	});
	assert.equal(snapshot.accounts[0].windows.length, 0);
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("review windows never block ordinary generation", async () => {
	for (const review of [{ allowed: false, limit_reached: true, primary_window: usageWindow(100, NOW + 999_000) }, { primary_window: { used_percent: "bad" } }]) {
		const { snapshot } = await load({ payload: { ...usage(), code_review_rate_limit: review } });
		assert.ok(snapshot.accounts[0].windows.some((window) => window.scope === "review"));
		assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	}
});

test("matches actual additional model limits by name, without mapping the opaque feature", async () => {
	const payload = {
		...usage(usageWindow(100, NOW + 60_000), undefined, { allowed: true, limit_reached: false }),
		additional_rate_limits: [{ limit_name: "GPT-5.3-Codex-Spark", metered_feature: "codex_bengalfox", rate_limit: { allowed: false, limit_reached: true, primary_window: usageWindow(100, NOW + 600_000, 604_800) } }],
	};
	const ordinary = await load({ payload });
	assert.deepEqual(quotaAvailability(ordinary.snapshot, MODEL, NOW), { kind: "ready" });
	const spark = await load({ payload }, SPARK);
	assert.deepEqual(quotaAvailability(spark.snapshot, SPARK, NOW), { kind: "wait", resetAt: NOW + 600_000 });
	assert.equal(spark.account.windows.find((window) => window.scope === "model")?.modelId, SPARK);
});

test("applicable additional exhaustion joins base blockers rather than selecting the earliest window", async () => {
	const payload = {
		...usage(usageWindow(100, NOW + 60_000)),
		additional_rate_limits: [{ limit_name: MODEL, rate_limit: { primary_window: usageWindow(100, NOW + 600_000), secondary_window: usageWindow(100, NOW + 900_000) } }],
	};
	const { snapshot } = await load({ payload });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 900_000 });
});

test("ambiguous exhausted additional limits stay unknown, never become a guessed model/family", async () => {
	for (const name of ["codex_bengalfox", "Codex extra requests", undefined]) {
		const { snapshot } = await load({ payload: { ...usage(), additional_rate_limits: [{ limit_name: name, rate_limit: { primary_window: usageWindow(100) } }] } });
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
		assert.equal(snapshot.accounts[0].windows.find((window) => window.scope === "model")?.modelId, undefined);
	}
});

test("review additional limits are review-only and ordinary quota remains usable", async () => {
	const { snapshot } = await load({ payload: { ...usage(), additional_rate_limits: [{ metered_feature: "codex_code_review", rate_limit: { allowed: false, primary_window: usageWindow(100) } }] } });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	assert.equal(snapshot.accounts[0].windows[1].scope, "review");
});

test("100% usage does not mean exhaustion when allowed=true or limit_reached=false", async () => {
	for (const flags of [{ allowed: true }, { limit_reached: false }, { allowed: true, limit_reached: false }]) {
		const { snapshot } = await load({ payload: usage(usageWindow(100), undefined, flags) });
		assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	}
});

test("allowed/limit-reached flags can block below 100% usage", async () => {
	for (const flags of [{ allowed: false }, { limit_reached: true }]) {
		const { snapshot } = await load({ payload: usage(usageWindow(40, NOW + 600_000), undefined, flags) });
		assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 600_000 });
	}
});

test("flags-only allowance/denial and paid/unlimited credit payloads retain their actual meaning", async () => {
	for (const payload of [
		{ rate_limit: { allowed: true } },
		{ credits: { has_credits: true, unlimited: false, balance: "12.50" } },
		{ credits: { has_credits: false, unlimited: true, balance: null } },
		{ ...usage(usageWindow(100)), credits: { has_credits: true } },
	]) {
		const { snapshot } = await load({ payload });
		assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	}
	const denied = await load({ payload: { rate_limit: { allowed: false } } });
	isUnknown(quotaAvailability(denied.snapshot, MODEL, NOW));
	const explicit = await load({ payload: { ...usage(usageWindow(100), undefined, { allowed: false }), credits: { unlimited: true } } });
	assert.equal(quotaAvailability(explicit.snapshot, MODEL, NOW).kind, "wait");
});

test("plan names, numeric balances, and manual reset credits do not grant permission", async () => {
	for (const extras of [{ plan_type: "pro" }, { credits: { balance: 100 } }, { rate_limit_reset_credits: { available_count: 10, applicable_available_count: 10 } }]) {
		const { snapshot, calls } = await load({ payload: { ...usage(usageWindow(100)), ...extras } });
		assert.equal(quotaAvailability(snapshot, MODEL, NOW).kind, "wait");
		assert.equal(calls.length, 3);
	}
});

test("credit allowances never override a model-specific restriction", async () => {
	const { snapshot } = await load({ payload: { ...usage(), credits: { unlimited: true }, additional_rate_limits: [{ limit_name: MODEL, rate_limit: { allowed: false, primary_window: usageWindow(100) } }] } });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 60_000 });
});

test("actual current weekly-primary payload and camelCase numeric strings parse without fabricated defaults", async () => {
	const { snapshot, account: result } = await load({ payload: {
		rateLimit: { allowed: true, limitReached: false, primaryWindow: { usedPercent: "1", limitWindowSeconds: "604800", resetAfterSeconds: "90" }, secondaryWindow: null },
	} });
	assert.equal(result.windows[0].durationSeconds, 604_800);
	assert.equal(result.windows[0].resetAt, NOW + 90_000);
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	const explicit = await load({ payload: usage({ used_percent: 100, reset_at: (NOW + 9000) / 1000, reset_after_seconds: 1000 }) });
	assert.equal(explicit.account.windows[0].resetAt, NOW + 9000);
});

function cooldown(scope: "credential" | "model", retryAt = NOW + 600_000, model_key?: string, extra: JsonRecord = {}): JsonRecord {
	return { scope, model_key, retry_at: new Date(retryAt).toISOString(), remaining_seconds: (retryAt - NOW) / 1000, reason: "quota", ...extra };
}

test("respects scheduler credential cooldown despite live quota and credits", async () => {
	const { snapshot, account: result } = await load({ files: [credential("a", { unavailable: true, cooldowns: [cooldown("credential")] })], payload: { ...usage(), credits: { unlimited: true } } });
	assert.equal(result.nextRetryAt, NOW + 600_000);
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 600_000 });
});

test("model-scoped scheduler cooldown does not block another verified model", async () => {
	const files = [credential("a", { unavailable: true, status: "error", next_retry_after: new Date(NOW + 999_000).toISOString(), cooldowns: [cooldown("model", NOW + 600_000, SPARK)] })];
	const ordinary = await load({ files });
	assert.equal(ordinary.account.nextRetryAt, undefined);
	assert.deepEqual(quotaAvailability(ordinary.snapshot, MODEL, NOW), { kind: "ready" });
	const spark = await load({ files }, SPARK);
	assert.deepEqual(quotaAvailability(spark.snapshot, SPARK, NOW), { kind: "wait", resetAt: NOW + 600_000 });
});

test("all applicable model and credential cooldowns join exhausted quota windows", async () => {
	const { snapshot } = await load({
		files: [credential("a", { cooldowns: [cooldown("credential", NOW + 60_000), cooldown("model", NOW + 600_000, MODEL)] })],
		payload: usage(usageWindow(100, NOW + 900_000)),
	});
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 900_000 });
});

test("old API scheduler retry time is respected only when unavailable", async () => {
	const retry = new Date(NOW + 600_000).toISOString();
	const blocked = await load({ files: [credential("a", { cooldowns: undefined, unavailable: true, next_retry_after: retry })] });
	assert.deepEqual(quotaAvailability(blocked.snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 600_000 });
	const inactive = await load({ files: [credential("a", { cooldowns: undefined, next_retry_after: retry })] });
	assert.deepEqual(quotaAvailability(inactive.snapshot, MODEL, NOW), { kind: "ready" });
});

test("credential auth failures are unknown, never quota exhaustion, even with a future retry", async () => {
	for (const overrides of [
		{ unavailable: true, status_message: `unauthorized ${KEY}`, cooldowns: undefined, next_retry_after: new Date(NOW + 600_000).toISOString() },
		{ status_message: "token expired" },
		{ cooldowns: [cooldown("credential", NOW + 600_000, undefined, { reason: "invalid_grant" })] },
		{ cooldowns: [cooldown("model", NOW + 600_000, SPARK, { http_status: 401 })] },
	]) {
		const { snapshot, account: result } = await load({ files: [credential("a", overrides)], payload: usage(usageWindow(100)) });
		assert.match(result.error!, /authentication|access/);
		assert.ok(!JSON.stringify(snapshot).includes(KEY));
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	}
});

test("unknown remote scheduler state, malformed cooldowns, and unavailable without a timer stay unknown", async () => {
	for (const overrides of [
		{ cooldowns: null }, { cooldowns: {} }, { cooldowns: [{ scope: "future" }] },
		{ cooldowns: [cooldown("model", NOW + 600_000)] },
		{ cooldowns: [cooldown("credential", NOW + 600_000, undefined, { retry_at: "tomorrow" })] },
		{ cooldowns: [cooldown("credential", NOW + 600_000, undefined, { reason: "unknown" })] },
		{ unavailable: true, cooldowns: undefined }, { unavailable: true, cooldowns: [] },
	]) {
		const { snapshot } = await load({ files: [credential("a", overrides)] });
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	}
});

test("transient scheduler cooldown can delay readiness, but elapsed timers need a fresh check", async () => {
	const { snapshot } = await load({ files: [credential("a", { cooldowns: [cooldown("credential", NOW + 60_000, undefined, { reason: "transient_error" })] })] });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "wait", resetAt: NOW + 60_000 });
	isUnknown(quotaAvailability(snapshot, MODEL, NOW + 60_001));
});

test("requires parsed account claim metadata; never probes an unscoped or header-injected account", async () => {
	for (const id_token of [undefined, "not-a-parsed-JWT", {}, { chatgpt_account_id: "bad\r\nAuthorization: secret" }]) {
		const { snapshot, calls } = await load({ files: [credential("a", { id_token })] });
		assert.equal(calls.length, 2);
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	}
	const nested = await load({ files: [credential("a", { id_token: undefined, metadata: { id_token: { "https://api.openai.com/auth": { chatgpt_account_id: "nested-claim" } } } })] });
	assert.equal((nested.calls[2].body?.header as JsonRecord)["Chatgpt-Account-Id"], "nested-claim");
});

test("bounds concurrent eligibility/probe work to four and preserves account order", async () => {
	let active = 0;
	let maxActive = 0;
	const normal = fixture({ files: Array.from({ length: 12 }, (_, index) => credential(String(index))) });
	const mock = mockFetch(async (call) => {
		if (call.url.endsWith("/credentials")) return normal.fetchImpl(call.url, call.init);
		active++;
		maxActive = Math.max(maxActive, active);
		await nextTurn();
		const response = await normal.fetchImpl(call.url, call.init);
		active--;
		return response;
	});
	const snapshot = await loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
	assert.equal(maxActive, 4);
	assert.equal(active, 0);
	assert.deepEqual(snapshot.accounts.map((item) => item.authIndex), Array.from({ length: 12 }, (_, index) => String(index)));
});

test("already-aborted signals reject before any request, without exposing their reason", async () => {
	const mock = fixture();
	const controller = new AbortController();
	controller.abort(new Error(KEY));
	await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, signal: controller.signal, fetchImpl: mock.fetchImpl }), (error: unknown) => {
		assert.ok(error instanceof Error);
		assert.equal(error.name, "AbortError");
		assert.ok(!error.message.includes(KEY));
		return true;
	});
	assert.equal(mock.calls.length, 0);
});

for (const stage of ["listing", "eligibility", "probe", "body"]) {
	test(`cancellation at ${stage} rejects the whole snapshot and propagates to in-flight work`, async () => {
		const controller = new AbortController();
		const normal = fixture({ files: Array.from({ length: 9 }, (_, index) => credential(String(index))) });
		const activeSignals: AbortSignal[] = [];
		const mock = mockFetch(async (call) => {
			const isList = call.url.endsWith("/credentials");
			const isModels = call.url.includes("/credentials/models?");
			const stall = stage === "listing" ? isList : stage === "eligibility" ? isModels : !isList && !isModels;
			if (!stall) return normal.fetchImpl(call.url, call.init);
			activeSignals.push(call.init.signal!);
			if (stage === "body") {
				const response = json(wrapped());
				Object.defineProperty(response, "json", { value: () => new Promise(() => {}) });
				return response;
			}
			return new Promise<Response>(() => {}); // deliberately ignores AbortSignal
		});
		const pending = loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, signal: controller.signal, now: NOW });
		const rejection = assert.rejects(pending, (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.equal(error.name, "AbortError");
			assert.ok(!error.message.includes(KEY));
			return true;
		});
		await nextTurn();
		assert.ok(activeSignals.length > 0);
		const requestsBeforeAbort = mock.calls.length;
		controller.abort(KEY);
		await rejection;
		await nextTurn();
		assert.ok(activeSignals.every((signal) => signal.aborted));
		assert.equal(mock.calls.length, requestsBeforeAbort);
	});
}

test("finite request deadline covers injected fetches that ignore signals", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const normal = fixture();
	let probeSignal: AbortSignal | undefined;
	const mock = mockFetch((call) => {
		if (!call.url.endsWith("/requests/api-call")) return normal.fetchImpl(call.url, call.init);
		probeSignal = call.init.signal!;
		return new Promise<Response>(() => {});
	});
	const pending = loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
	await nextTurn();
	assert.ok(probeSignal);
	context.mock.timers.tick(10_000);
	const snapshot = await pending;
	assert.equal(probeSignal.aborted, true);
	assert.match(snapshot.accounts[0].error!, /timed out/);
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("finite deadline also covers response-body parsing", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const normal = fixture();
	const mock = mockFetch((call) => {
		if (!call.url.endsWith("/requests/api-call")) return normal.fetchImpl(call.url, call.init);
		const response = json(wrapped());
		Object.defineProperty(response, "json", { value: () => new Promise(() => {}) });
		return response;
	});
	const pending = loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
	await nextTurn();
	context.mock.timers.tick(10_000);
	const snapshot = await pending;
	assert.match(snapshot.accounts[0].error!, /timed out/);
});

test("overall deadline aborts active workers and never returns a partial snapshot", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const normal = fixture({ files: Array.from({ length: 40 }, (_, index) => credential(String(index))) });
	const signals: AbortSignal[] = [];
	const mock = mockFetch((call) => {
		if (!call.url.endsWith("/requests/api-call")) return normal.fetchImpl(call.url, call.init);
		signals.push(call.init.signal!);
		return new Promise<Response>(() => {});
	});
	const pending = loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
	const rejection = assert.rejects(pending, /Quota check timed out/);
	await nextTurn();
	context.mock.timers.tick(10_000);
	await nextTurn();
	context.mock.timers.tick(10_000);
	await nextTurn();
	context.mock.timers.tick(10_000);
	await rejection;
	assert.ok(signals.length >= 4);
	assert.ok(signals.every((signal) => signal.aborted));
	const count = mock.calls.length;
	await nextTurn();
	assert.equal(mock.calls.length, count);
});

test("successful completion clears deadlines and abort listeners", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const controller = new AbortController();
	const mock = fixture();
	const snapshot = await loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, signal: controller.signal, now: NOW });
	context.mock.timers.tick(100_000);
	controller.abort(KEY);
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	assert.equal(mock.calls.length, 3);
});

test("network exceptions and body/parser errors are never exposed verbatim", async () => {
	const normal = fixture();
	const mock = mockFetch((call) => {
		if (!call.url.endsWith("/requests/api-call")) return normal.fetchImpl(call.url, call.init);
		throw new Error(`Authorization: Bearer ${KEY}; /private/credential.json`);
	});
	const snapshot = await loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, modelId: MODEL, fetchImpl: mock.fetchImpl, now: NOW });
	assert.match(snapshot.accounts[0].error!, /check the proxy connection/);
	assert.ok(!JSON.stringify(snapshot).includes(KEY));
	assert.ok(!JSON.stringify(snapshot).includes("/private"));
});

test("snapshots project only public fields and redact secrets/terminal controls from labels", async () => {
	const accessToken = "access-secret-for-tests";
	const { snapshot, account: result } = await load({ files: [credential("a", {
		label: `\u001b[31mAccount\u001b[0m\n\u001b]52;c;clipboard\u0007\u202e ${KEY} ${accessToken} Bearer arbitrary-secret`,
		access_token: accessToken, refresh_token: "refresh-secret", note: "private note", path: "/private/credentials.json",
		metadata: { access_token: accessToken }, headers: { Authorization: "Bearer header-secret" },
	})] });
	const serialized = JSON.stringify(snapshot);
	for (const secret of [KEY, accessToken, "refresh-secret", "arbitrary-secret", "header-secret", "/private", "private note", "claim-a"]) assert.ok(!serialized.includes(secret));
	assert.ok(!/[\u0000-\u001f\u007f-\u009f\u202e]/.test(result.label));
	assert.deepEqual(Object.keys(snapshot).sort(), ["accounts", "checkedAt"]);
	assert.deepEqual(Object.keys(result).sort(), ["authIndex", "disabled", "eligible", "label", "provider", "unavailable", "windows"]);
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
});

test("formatting is plain text, distinguishes review/disabled/unknown, and never renders raw errors", () => {
	const snapshot: QuotaSnapshot = {
		checkedAt: NOW,
		accounts: [account({ label: "\u001b[31mAccount\n\u202eA", error: `Authorization: Bearer ${KEY}`, windows: [
			{ label: "\u001b]52;c;secret\u0007Generation", scope: "account", usedPercent: 12.34, resetAt: NOW + 60_000 },
			{ label: "Review", scope: "review", usedPercent: 100, limitReached: true },
			{ label: "Additional", scope: "model" },
		] }), account({ disabled: true, label: "Disabled" })],
	};
	const output = formatQuotaSnapshot(snapshot, NOW);
	assert.match(output, /12\.3% used/);
	assert.match(output, /review only/);
	assert.match(output, /applicability unknown/);
	assert.match(output, /reset unknown/);
	assert.match(output, /disabled \(not probed\)/);
	assert.ok(!output.includes(KEY));
	assert.ok(!/[\u001b\u0007\u202e]/.test(output));
	assert.match(formatQuotaSnapshot({ checkedAt: NOW, accounts: [] }), /No Codex accounts/);
});

test("invalid base URLs/time/key fail safely before fetch, with no credential echo", async () => {
	const mock = fixture();
	for (const baseUrl of [`https://user:${KEY}@proxy.invalid`, `https://proxy.invalid?key=${KEY}`, "file:///private/credentials", "not-a-url"]) {
		await assert.rejects(loadQuotaSnapshot({ baseUrl, managementKey: KEY, fetchImpl: mock.fetchImpl }), (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.ok(!error.message.includes(KEY));
			return true;
		});
	}
	await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: "", fetchImpl: mock.fetchImpl }), /management key/);
	await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: `${KEY}\r\n`, fetchImpl: mock.fetchImpl }), /management key/);
	await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, now: NaN, fetchImpl: mock.fetchImpl }), /Invalid check time/);
	assert.equal(mock.calls.length, 0);
	isUnknown(quotaAvailability({ checkedAt: NOW, accounts: [account()] }, MODEL, NaN));
});

test("model-only applicable windows use every blocking reset, while review-only snapshots stay unknown", () => {
	assert.deepEqual(availability([account({ windows: [exhausted(NOW + 60_000, "model", MODEL), exhausted(NOW + 600_000, "model", MODEL)] })]), { kind: "wait", resetAt: NOW + 600_000 });
	assert.deepEqual(availability([account({ windows: [{ label: "Model", scope: "model", modelId: MODEL, allowed: true }] })]), { kind: "ready" });
	isUnknown(availability([account({ windows: [exhausted(NOW + 60_000, "review")] })]));
});

test("public account-level denial is respected without relying on loader-specific window flags", () => {
	assert.deepEqual(availability([account({ allowed: false, hasCredits: true, windows: [{ label: "Generation", scope: "account", usedPercent: 10, resetAt: NOW + 600_000 }] })]), { kind: "wait", resetAt: NOW + 600_000 });
	isUnknown(availability([account({ allowed: false, windows: [] })]));
	isUnknown(availability([account({ allowed: false, windows: [{ label: "Generation", scope: "account", usedPercent: 10, limitReached: false }] })]));
});

test("a verified alias cannot rule out a restricted additional model's quota", async () => {
	const alias = "fast";
	const { snapshot } = await load({
		models: { "account-a.json": { models: [{ id: alias }] } },
		payload: { ...usage(), additional_rate_limits: [{ limit_name: SPARK, rate_limit: { allowed: false, primary_window: usageWindow(100) } }] },
	}, alias);
	isUnknown(quotaAvailability(snapshot, alias, NOW));
});

test("malformed additional review windows cannot block ordinary generation", async () => {
	const { snapshot } = await load({ payload: { ...usage(), additional_rate_limits: [{ metered_feature: "codex_code_review", rate_limit: { allowed: false, primary_window: { used_percent: "invalid" } } }] } });
	assert.deepEqual(quotaAvailability(snapshot, MODEL, NOW), { kind: "ready" });
	assert.equal(snapshot.accounts[0].windows[1].scope, "review");
});

test("invalid calendar dates and non-RFC3339 cooldown times remain unknown", async () => {
	for (const retry_at of ["2026-02-30T12:00:00Z", "2026-10-02T25:00:00Z", "2026-10-02T12:00Z", "2026-10-02T12:00:00"]) {
		const { snapshot } = await load({ files: [credential("a", { cooldowns: [cooldown("credential", NOW + 600_000, undefined, { retry_at })] })] });
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	}
});

test("scheduler model keys cannot retain terminal controls or credential secrets", async () => {
	for (const model_key of [`${MODEL}\u001b[31m`, `gpt-${KEY}`]) {
		const { snapshot } = await load({ files: [credential("a", { cooldowns: [cooldown("model", NOW + 600_000, model_key)] })] });
		assert.ok(!JSON.stringify(snapshot).includes(KEY));
		assert.ok(!JSON.stringify(snapshot).includes("\\u001b"));
		isUnknown(quotaAvailability(snapshot, MODEL, NOW));
	}
});

test("upstream additional model IDs cannot leak known credentials", async () => {
	const { snapshot } = await load({ payload: { ...usage(), additional_rate_limits: [{ limit_name: `gpt-${KEY}`, rate_limit: { primary_window: usageWindow(100) } }] } });
	assert.ok(!JSON.stringify(snapshot).includes(KEY));
	isUnknown(quotaAvailability(snapshot, MODEL, NOW));
});

test("redacts authorization token fragments and rejects secret-bearing auth indexes", async () => {
	const secret = "header-secret-for-tests";
	const result = await load({ files: [credential("a", { label: `Account ${secret}`, headers: { Authorization: `Bearer ${secret}` } })] });
	assert.ok(!JSON.stringify(result.snapshot).includes(secret));
	const invalid = await load({ files: [credential(`index-${KEY}`)] });
	assert.equal(invalid.calls.length, 1);
	assert.equal(invalid.account.authIndex, "");
	assert.ok(!JSON.stringify(invalid.snapshot).includes(KEY));
});

test("null allowance and unknown credential error states cannot authorize readiness", async () => {
	const badFlag = await load({ payload: usage(usageWindow(), undefined, { allowed: null }) });
	isUnknown(quotaAvailability(badFlag.snapshot, MODEL, NOW));
	const badState = await load({ files: [credential("a", { status: "error", status_message: "unspecified credential failure" })] });
	isUnknown(quotaAvailability(badState.snapshot, MODEL, NOW));
});

test("abort listeners are removed after success, failure, and cancellation", async () => {
	for (const mode of ["success", "failure", "abort"]) {
		const controller = new AbortController();
		const normal = fixture();
		const mock = mode === "success" ? normal : mockFetch(() => {
			if (mode === "failure") throw new Error(KEY);
			return new Promise<Response>(() => {});
		});
		const pending = loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, fetchImpl: mock.fetchImpl, signal: controller.signal, now: NOW });
		const settled = mode === "success" ? pending : assert.rejects(pending);
		if (mode === "abort") { await nextTurn(); controller.abort(KEY); }
		await settled;
		assert.equal(getEventListeners(controller.signal, "abort").length, 0);
		assert.ok(mock.calls.every((call) => getEventListeners(call.init.signal!, "abort").length === 0));
	}
});

test("aborting a 404 response prevents a fallback request", async () => {
	const controller = new AbortController();
	const mock = mockFetch(() => { controller.abort(KEY); return json({ error: KEY }, 404); });
	await assert.rejects(loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, fetchImpl: mock.fetchImpl, signal: controller.signal }), { name: "AbortError" });
	assert.equal(mock.calls.length, 1);
});

test("a stalled credential listing has a finite deadline and no partial snapshot", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const mock = mockFetch(() => new Promise<Response>(() => {}));
	const pending = loadQuotaSnapshot({ baseUrl: ROOT, managementKey: KEY, fetchImpl: mock.fetchImpl });
	const rejection = assert.rejects(pending, /Quota request timed out/);
	await nextTurn();
	context.mock.timers.tick(10_000);
	await rejection;
	assert.ok(mock.calls[0].init.signal?.aborted);
});
