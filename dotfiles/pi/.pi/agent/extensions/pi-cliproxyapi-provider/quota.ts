import { stripVTControlCharacters } from "node:util";

export type QuotaWindow = {
	label: string;
	scope: "account" | "model" | "review";
	modelId?: string;
	usedPercent?: number;
	resetAt?: number;
	durationSeconds?: number;
	limitReached?: boolean;
	allowed?: boolean;
};

export type QuotaAccount = {
	authIndex: string;
	label: string;
	provider: string;
	disabled: boolean;
	unavailable: boolean;
	nextRetryAt?: number;
	eligible: boolean | "unknown";
	windows: QuotaWindow[];
	allowed?: boolean;
	hasCredits?: boolean;
	error?: string;
};

export type QuotaSnapshot = { checkedAt: number; accounts: QuotaAccount[] };
export type QuotaAvailability =
	| { kind: "ready" }
	| { kind: "wait"; resetAt: number }
	| { kind: "unknown"; reason: string };

type RecordValue = Record<string, unknown>;
type LoadOptions = {
	baseUrl: string;
	managementKey: string;
	modelId?: string;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
	now?: number;
};

const REQUEST_TIMEOUT_MS = 10_000;
const SNAPSHOT_TIMEOUT_MS = 30_000;
const PROBE_CONCURRENCY = 4;
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
// Bind verified eligibility to the requested model, without extending the public
// snapshot or retaining credential records. A loaded snapshot is not a model catalog.
const eligibilityModels = new WeakMap<QuotaAccount, string>();

class QuotaError extends Error {
	status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "QuotaError";
		this.status = status;
	}
}

function record(value: unknown): RecordValue | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as RecordValue)
		: undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publicText(value: unknown, secrets: string[] = []): string {
	let result = typeof value === "string" ? value : "";
	for (const secret of secrets) {
		if (secret) result = result.split(secret).join("[redacted]");
	}
	return stripVTControlCharacters(result)
		.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
		.replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
		.trim()
		.slice(0, 160);
}

function credentialSecrets(entry: RecordValue, managementKey: string): string[] {
	const secrets = [managementKey];
	const metadata = record(entry.metadata);
	const attributes = record(entry.attributes);
	for (const source of [entry, metadata, attributes, record(entry.headers), record(metadata?.headers), record(attributes?.headers)]) {
		if (!source) continue;
		for (const key of ["access_token", "refresh_token", "token", "cookie", "api_key", "id_token", "authorization", "Authorization"]) {
			const value = source[key];
			if (typeof value !== "string" || !value) continue;
			secrets.push(value);
			if (key.toLowerCase() === "authorization") secrets.push(value.replace(/^[A-Za-z]+[ \t]+/, ""));
		}
	}
	return secrets;
}

function invalidPayload(): never {
	throw new QuotaError("Invalid quota response; update the proxy or retry the live quota check.");
}

function numeric(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) {
		return invalidPayload();
	}
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0) return invalidPayload();
	return number;
}

function boolean(value: unknown): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") return invalidPayload();
	return value;
}

function validTime(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= 8.64e15;
}

// Scheduler times are RFC3339, not the Unix seconds used by wham windows.
function schedulerTime(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
		return invalidPayload();
	}
	const result = Date.parse(value);
	const calendarDay = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
	if (!validTime(result) || !validTime(calendarDay)
		|| new Date(calendarDay).toISOString().slice(0, 10) !== value.slice(0, 10)) return invalidPayload();
	return result;
}

function modelKey(value: string): string {
	// No family/prefix matching: Spark, mini, aliases, and reasoning variants
	// cannot safely be assumed to share a model-specific limit.
	return value.trim().toLowerCase();
}

function abortError(): DOMException {
	// Never propagate signal.reason: a caller may include credentials in it.
	return new DOMException("Quota check cancelled.", "AbortError");
}

function checkAbort(signal: AbortSignal): void {
	if (signal.aborted) throw abortError();
}

function managementRoot(baseUrl: string): string {
	try {
		const url = new URL(baseUrl);
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
			throw new Error();
		}
		url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
		return url.toString().replace(/\/+$/, "");
	} catch {
		throw new QuotaError("Invalid proxy URL; use an HTTP(S) root or /v1 URL without credentials or query parameters.");
	}
}

/** Each deadline covers both fetching and reading JSON, including injected fetches
 * that ignore AbortSignal. All timers and listeners are removed on every path. */
async function requestJson(
	url: string,
	init: RequestInit,
	fetchImpl: typeof fetch,
	signal: AbortSignal,
): Promise<unknown> {
	checkAbort(signal);
	const controller = new AbortController();
	let timedOut = false;
	const cancel = () => controller.abort();
	signal.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, REQUEST_TIMEOUT_MS);
	let onAbort: () => void = () => {};
	const aborted = new Promise<never>((_, reject) => {
		onAbort = () => reject(timedOut
			? new QuotaError("Quota request timed out; retry the live quota check.")
			: abortError());
		controller.signal.addEventListener("abort", onAbort, { once: true });
	});
	const operation = Promise.resolve().then(async () => {
		checkAbort(controller.signal);
		const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "error" });
		if (controller.signal.aborted) {
			void response.body?.cancel().catch(() => {});
			checkAbort(controller.signal);
		}
		if (!response.ok) {
			void response.body?.cancel().catch(() => {});
			const action = response.status === 401 || response.status === 403
				? "check the management key and access policy"
				: "check the proxy and retry";
			throw new QuotaError(`Management API HTTP ${response.status}; ${action}.`, response.status);
		}
		try {
			return await response.json();
		} catch {
			return invalidPayload();
		}
	});
	try {
		return await Promise.race([operation, aborted]);
	} catch (error) {
		if (signal.aborted) throw abortError();
		if (timedOut) throw new QuotaError("Quota request timed out; retry the live quota check.");
		if (error instanceof QuotaError) throw error;
		throw new QuotaError("Quota request failed; check the proxy connection and retry.");
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", cancel);
		controller.signal.removeEventListener("abort", onAbort);
		controller.abort();
	}
}

function accountId(entry: RecordValue): string | undefined {
	const metadata = record(entry.metadata);
	for (const candidate of [entry.id_token, metadata?.id_token]) {
		const claims = record(candidate);
		const auth = record(claims?.["https://api.openai.com/auth"]) ?? claims;
		const id = text(auth?.chatgpt_account_id ?? auth?.chatgptAccountId);
		if (id && /^[A-Za-z0-9_-]{1,256}$/.test(id)) return id;
	}
	return undefined;
}

function authFailure(entry: RecordValue): boolean {
	const message = text(entry.status_message) ?? "";
	return /\b(?:unauthorized|invalid_grant|token expired|token revoked|invalid[ _]token|invalid credentials|invalid[ _]api[ _]key|authentication failed|auth failed)\b/i.test(message);
}

/** Project scheduler state, never passive quota/model_quotas observations. */
function addCooldowns(account: QuotaAccount, entry: RecordValue, secrets: string[], modelId?: string): void {
	if (authFailure(entry)) {
		account.error = "Credential authentication failed; reauthenticate the account and retry.";
		return;
	}
	const cooldowns = entry.cooldowns;
	if (cooldowns === undefined) {
		const retryAt = schedulerTime(entry.next_retry_after);
		if (account.unavailable && retryAt !== undefined) account.nextRetryAt = retryAt;
		else if (account.unavailable || entry.status === "error") {
			account.error = "Credential availability is unknown; check account authentication and retry.";
		}
		return;
	}
	if (!Array.isArray(cooldowns)) {
		account.error = "Scheduler state is unavailable; refresh the management API before resuming.";
		return;
	}
	let relevant = false;
	let hasModelCooldown = false;
	for (const item of cooldowns) {
		const cooldown = record(item);
		if (!cooldown || !["credential", "model"].includes(String(cooldown.scope))) return invalidPayload();
		const scope = cooldown.scope === "credential" ? "account" : "model";
		const model = scope === "model" ? text(cooldown.model_key) : undefined;
		if (scope === "model" && (!model || /[\u0000-\u0020\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(model)
			|| secrets.some((secret) => model.includes(secret)))) return invalidPayload();
		const retryAt = schedulerTime(cooldown.retry_at);
		const remaining = numeric(cooldown.remaining_seconds);
		if (retryAt === undefined || remaining === undefined || !Number.isSafeInteger(remaining) || remaining <= 0) {
			return invalidPayload();
		}
		hasModelCooldown ||= scope === "model";
		const applies = scope === "account" || !modelId || modelKey(model!) === modelKey(modelId);
		const reason = text(cooldown.reason);
		if (["unauthorized", "invalid_grant", "payment_required"].includes(reason ?? "") || cooldown.http_status === 401 || cooldown.http_status === 403) {
			account.error = "Credential authentication or access failed; reauthenticate the account and retry.";
		} else if (applies && !["credential_quota", "quota", "transient_error"].includes(reason ?? "")) {
			account.error = "Scheduler restriction is unknown; check the credential and retry.";
		}
		if (applies) relevant = true;
		if (scope === "account") account.nextRetryAt = Math.max(account.nextRetryAt ?? 0, retryAt);
		else account.windows.push({ label: "Scheduler cooldown", scope, modelId: model, resetAt: retryAt, limitReached: true, allowed: false });
	}
	// Auth-level unavailability may summarize blocked *other* models. The
	// explicit scoped projection, not that aggregate, is the scheduler gate.
	if (hasModelCooldown && !account.error) account.unavailable = false;
	else if ((account.unavailable || entry.status === "error") && !relevant && !account.error) {
		account.error = "Credential availability is unknown; check account authentication and retry.";
	}
}

function windowFrom(value: unknown, now: number): Omit<QuotaWindow, "label" | "scope"> {
	const raw = record(value);
	if (!raw) return invalidPayload();
	const usedPercent = numeric(raw.used_percent ?? raw.usedPercent);
	const durationSeconds = numeric(raw.limit_window_seconds ?? raw.limitWindowSeconds);
	const resetSeconds = numeric(raw.reset_at ?? raw.resetAt);
	const resetAfter = numeric(raw.reset_after_seconds ?? raw.resetAfterSeconds);
	const resetAt = resetSeconds !== undefined ? resetSeconds * 1000
		: resetAfter !== undefined ? now + resetAfter * 1000 : undefined;
	if ((resetAt !== undefined && !validTime(resetAt)) || durationSeconds === 0) return invalidPayload();
	if (usedPercent === undefined && resetAt === undefined && durationSeconds === undefined) return invalidPayload();
	return {
		...(usedPercent !== undefined ? { usedPercent } : {}),
		...(durationSeconds !== undefined ? { durationSeconds } : {}),
		...(resetAt !== undefined ? { resetAt } : {}),
	};
}

function addRateLimit(
	windows: QuotaWindow[], value: unknown, scope: QuotaWindow["scope"], label: string, now: number, modelId?: string,
): { allowed?: boolean } {
	const rate = record(value);
	if (!rate) return invalidPayload();
	const allowed = boolean(rate.allowed);
	const reached = boolean(rate.limit_reached ?? rate.limitReached);
	if (allowed === true && reached === true) return invalidPayload();
	const candidates: QuotaWindow[] = [];
	for (const [key, camelKey, suffix] of [["primary_window", "primaryWindow", "primary"], ["secondary_window", "secondaryWindow", "secondary"]]) {
		const raw = rate[key] ?? rate[camelKey];
		if (raw != null) candidates.push({ label: `${label} ${suffix}`, scope, ...(modelId ? { modelId } : {}), ...windowFrom(raw, now) });
	}
	if (!candidates.length) {
		if (allowed === undefined && reached === undefined) return invalidPayload();
		candidates.push({ label, scope, ...(modelId ? { modelId } : {}) });
	}
	const blocked = allowed === false || reached === true;
	const hasExhausted = candidates.some((window) => window.usedPercent !== undefined && window.usedPercent >= 100);
	for (const window of candidates) {
		// Aggregate flags do not identify which window caused the denial. Use
		// measured exhausted windows when known; otherwise include every possible
		// blocker. A missing reset must remain unknown, never a guessed deadline.
		const possibleBlocker = !hasExhausted || window.usedPercent === undefined || window.usedPercent >= 100;
		if (blocked && possibleBlocker) {
			window.limitReached = true;
			if (allowed !== undefined) window.allowed = allowed;
		} else if (blocked) {
			window.limitReached = false;
		} else {
			if (allowed !== undefined) window.allowed = allowed;
			if (reached !== undefined) window.limitReached = reached;
		}
		windows.push(window);
	}
	return allowed === undefined ? {} : { allowed };
}

function applyUsage(account: QuotaAccount, payload: unknown, now: number, secrets: string[]): void {
	const usage = record(payload);
	if (!usage) return invalidPayload();
	const rate = usage.rate_limit ?? usage.rateLimit;
	const credits = usage.credits == null ? undefined : record(usage.credits);
	if (usage.credits != null && !credits) return invalidPayload();
	if (credits) {
		const hasCredits = boolean(credits.has_credits ?? credits.hasCredits);
		const unlimited = boolean(credits.unlimited);
		numeric(credits.balance); // A balance alone is not permission to spend credits.
		if (unlimited === true || hasCredits !== undefined) account.hasCredits = unlimited === true || hasCredits === true;
	}
	if (rate != null) Object.assign(account, addRateLimit(account.windows, rate, "account", "Generation", now));
	else if (account.hasCredits !== true) return invalidPayload();
	const review = usage.code_review_rate_limit ?? usage.codeReviewRateLimit;
	if (review != null) {
		try {
			addRateLimit(account.windows, review, "review", "Code review", now);
		} catch {
			// Review data can be displayed as unknown but cannot block generation.
			account.windows.push({ label: "Code review quota unavailable", scope: "review" });
		}
	}
	const additional = usage.additional_rate_limits ?? usage.additionalRateLimits;
	if (additional != null) {
		if (!Array.isArray(additional)) return invalidPayload();
		for (const value of additional) {
			const item = record(value);
			if (!item) return invalidPayload();
			const name = text(item.limit_name ?? item.limitName);
			const feature = text(item.metered_feature ?? item.meteredFeature);
			const isReview = [name, feature].some((id) => id && /^(?:codex[-_ ]?)?code[-_ ]?review$/i.test(id));
			// A human-readable GPT model name is matchable. Opaque metered feature
			// names (e.g. codex_bengalfox) are not evidence of model applicability.
			const model = [name, feature].find((id) => id && /^gpt-[a-z0-9 ._-]+$/i.test(id));
			if (isReview) {
				try { addRateLimit(account.windows, item.rate_limit ?? item.rateLimit, "review", "Additional review quota", now); }
				catch { account.windows.push({ label: "Additional review quota unavailable", scope: "review" }); }
			} else {
				if (model && secrets.some((secret) => model.includes(secret))) return invalidPayload();
				addRateLimit(account.windows, item.rate_limit ?? item.rateLimit, "model", "Additional quota", now, model ? modelKey(model) : undefined);
			}
		}
	}
}

/** Read management metadata and live Codex usage only. Never reads credential files,
 * spends credits, or uses passive observations as permission to resume. */
export async function loadQuotaSnapshot(options: LoadOptions): Promise<QuotaSnapshot> {
	const checkedAt = options.now ?? Date.now();
	if (!validTime(checkedAt)) throw new QuotaError("Invalid check time; retry with a valid timestamp.");
	if (!options.managementKey || /[\r\n\u0000]/.test(options.managementKey)) {
		throw new QuotaError("A valid management key is required for quota checks.");
	}
	if (options.modelId !== undefined && !text(options.modelId)) {
		throw new QuotaError("A model ID is required to verify eligibility.");
	}
	if (options.signal?.aborted) throw abortError();
	const root = managementRoot(options.baseUrl);
	const controller = new AbortController();
	const cancel = () => controller.abort();
	options.signal?.addEventListener("abort", cancel, { once: true });
	let timedOut = false;
	const timer = setTimeout(() => { timedOut = true; controller.abort(); }, SNAPSHOT_TIMEOUT_MS);
	const fetchImpl = options.fetchImpl ?? fetch;
	const headers = { Authorization: `Bearer ${options.managementKey}`, "Content-Type": "application/json" };
	const request = async (v8: string, v0: string, body?: RecordValue): Promise<unknown> => {
		const init = { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) };
		try {
			return await requestJson(`${root}/v8/management/${v8}`, init, fetchImpl, controller.signal);
		} catch (error) {
			checkAbort(controller.signal);
			// Only the management HTTP status can trigger compatibility fallback.
			// An upstream wrapper status (including 404) never does.
			if (!(error instanceof QuotaError) || error.status !== 404) throw error;
			return requestJson(`${root}/v0/management/${v0}`, init, fetchImpl, controller.signal);
		}
	};
	try {
		const listing = record(await request("credentials", "auth-files"));
		if (!listing || !Array.isArray(listing.files)) return invalidPayload();
		const entries = listing.files.map((value) => {
			const entry = record(value);
			if (!entry || !text(entry.provider ?? entry.type)) return invalidPayload();
			return entry;
		}).filter((entry) => text(entry.provider ?? entry.type)?.toLowerCase() === "codex");
		const accounts = entries.map((entry): QuotaAccount => {
			const secrets = credentialSecrets(entry, options.managementKey);
			const index = typeof entry.auth_index === "number" && Number.isSafeInteger(entry.auth_index) && entry.auth_index >= 0
				? String(entry.auth_index) : text(entry.auth_index) ?? "";
			const account: QuotaAccount = {
				authIndex: /^[A-Za-z0-9_.:-]{1,256}$/.test(index) && !secrets.some((secret) => index.includes(secret)) ? index : "",
				label: publicText(text(entry.label) ?? text(entry.email) ?? text(entry.name) ?? "Codex account", secrets) || "Codex account",
				provider: "codex",
				disabled: entry.disabled === true || entry.status === "disabled",
				unavailable: entry.unavailable === true,
				eligible: "unknown",
				windows: [],
			};
			if (options.modelId) eligibilityModels.set(account, options.modelId);
			if (typeof entry.disabled !== "boolean" || typeof entry.unavailable !== "boolean" || !account.authIndex) {
				account.error = "Credential metadata is incomplete; refresh the management API.";
			} else if (!account.disabled) {
				try { addCooldowns(account, entry, secrets, options.modelId); }
				catch { account.error = "Invalid scheduler state; update the proxy and retry."; }
			}
			return account;
		});
		const seen = new Set<string>();
		for (const account of accounts) {
			if (seen.has(account.authIndex)) {
				for (const duplicate of accounts.filter((item) => item.authIndex === account.authIndex)) {
					duplicate.error = "Duplicate credential index; refresh the management API.";
				}
			}
			seen.add(account.authIndex);
		}
		let next = 0;
		const worker = async () => {
			while (next < accounts.length) {
				checkAbort(controller.signal);
				const index = next++;
				const account = accounts[index];
				const entry = entries[index];
				if (account.disabled || !account.authIndex || typeof entry.disabled !== "boolean" || typeof entry.unavailable !== "boolean") continue;
				if (account.error === "Duplicate credential index; refresh the management API.") continue;
				try {
					if (options.modelId) {
						const name = text(entry.name);
						if (!name) throw new QuotaError("Credential filename is missing; refresh the management API.");
						const query = new URLSearchParams({ name }).toString();
						const models = record(await request(`credentials/models?${query}`, `auth-files/models?${query}`));
						if (!models || !Array.isArray(models.models) || models.models.some((model) => !text(record(model)?.id))) {
							throw new QuotaError("Model eligibility is unavailable; refresh the model list and retry.");
						}
						// Registry IDs are exact, including aliases/prefixes. Do not infer
						// eligibility from a public/global catalog or a family name.
						account.eligible = models.models.some((model) => record(model)?.id === options.modelId);
						if (!account.eligible) continue;
					}
					const id = accountId(entry);
					if (!id) throw new QuotaError("Codex account claim is missing; reauthenticate the account and retry.");
					const wrapper = record(await request("requests/api-call", "api-call", {
						auth_index: account.authIndex,
						method: "GET",
						url: USAGE_URL,
						header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "Chatgpt-Account-Id": id },
					}));
					if (!wrapper || typeof wrapper.status_code !== "number" || !Number.isInteger(wrapper.status_code)
						|| wrapper.status_code < 100 || wrapper.status_code > 599 || typeof wrapper.body !== "string") return invalidPayload();
					if (wrapper.status_code < 200 || wrapper.status_code >= 300) {
						const action = wrapper.status_code === 401 || wrapper.status_code === 403
							? "reauthenticate the credential or check account access" : "retry the live quota check";
						throw new QuotaError(`Quota probe HTTP ${wrapper.status_code}; ${action}.`);
					}
					let usage: unknown;
					try { usage = JSON.parse(wrapper.body); } catch { return invalidPayload(); }
					applyUsage(account, usage, options.now ?? Date.now(), credentialSecrets(entry, options.managementKey));
				} catch (error) {
					checkAbort(controller.signal);
					account.error = error instanceof QuotaError ? error.message : "Live quota check failed; retry.";
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, accounts.length) }, () => worker()));
		checkAbort(controller.signal);
		return { checkedAt, accounts };
	} catch (error) {
		if (options.signal?.aborted) throw abortError();
		if (timedOut) throw new QuotaError("Quota check timed out; retry with fewer accounts or check the proxy.");
		if (error instanceof QuotaError) throw error;
		throw new QuotaError("Quota check failed; check the management API and retry.");
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", cancel);
		controller.abort();
	}
}

type WindowState = "ready" | "blocked" | "unknown";

function windowState(window: QuotaWindow, account: QuotaAccount): WindowState {
	if ((window.allowed === true && window.limitReached === true)
		|| (window.usedPercent !== undefined && (!Number.isFinite(window.usedPercent) || window.usedPercent < 0))) return "unknown";
	if (window.allowed === false || window.limitReached === true) return "blocked";
	if (window.allowed === true || window.limitReached === false) return "ready";
	if (window.scope === "account") {
		if (account.allowed === false) return "blocked";
		if (account.allowed === true || account.hasCredits === true) return "ready";
	}
	if (window.usedPercent !== undefined) return window.usedPercent >= 100 ? "blocked" : "ready";
	return "unknown";
}

/** MAX of applicable blocking resets per account, then MIN over eligible accounts.
 * A reset that has elapsed requires another live probe, not an assumed refill. */
export function quotaAvailability(snapshot: QuotaSnapshot, modelId: string, now = Date.now()): QuotaAvailability {
	const unknown = (reason: string): QuotaAvailability => ({ kind: "unknown", reason });
	if (!text(modelId) || !validTime(now) || !validTime(snapshot.checkedAt)) return unknown("Invalid quota check context; reload quota.");
	const resets: number[] = [];
	let uncertain = false;
	let considered = false;
	for (const account of snapshot.accounts) {
		if (account.provider !== "codex" || account.disabled) continue;
		const verifiedModel = eligibilityModels.get(account);
		if (verifiedModel !== undefined && verifiedModel !== modelId) { uncertain = true; continue; }
		if (account.eligible === false) continue;
		considered = true;
		if (account.eligible !== true || account.error) { uncertain = true; continue; }
		let accountUnknown = false;
		const blockers: number[] = [];
		const addBlocker = (resetAt?: number) => {
			if (resetAt === undefined || !validTime(resetAt) || resetAt <= now) accountUnknown = true;
			else blockers.push(resetAt);
		};
		if (account.nextRetryAt !== undefined) addBlocker(account.nextRetryAt);
		else if (account.unavailable) accountUnknown = true;
		let hasGenerationEvidence = account.allowed === true || account.hasCredits === true;
		const baseWindows = account.windows.filter((window) => window.scope === "account");
		if (account.allowed === false && !baseWindows.some((window) => windowState(window, account) === "blocked")) accountUnknown = true;
		for (const window of account.windows) {
			if (window.scope === "review") continue;
			const state = windowState(window, account);
			if (window.scope === "model") {
				if (window.modelId && modelKey(window.modelId) !== modelKey(modelId)) {
					// Alias/prefixed IDs do not disclose their underlying quota model.
					// A restriction cannot safely be ruled out for those IDs.
					if (!/^gpt-[a-z0-9.-]+$/i.test(modelId) && state !== "ready") accountUnknown = true;
					continue;
				}
				if (!window.modelId) {
					if (state !== "ready") accountUnknown = true;
					continue;
				}
			}
			hasGenerationEvidence ||= state !== "unknown";
			if (state === "blocked") addBlocker(window.resetAt);
			else if (state === "unknown") accountUnknown = true;
		}
		if (!hasGenerationEvidence) accountUnknown = true;
		if (accountUnknown) uncertain = true;
		else if (!blockers.length) return { kind: "ready" };
		else resets.push(Math.max(...blockers));
	}
	if (uncertain) return unknown("Some enabled accounts have unverified eligibility or quota; retry the live quota check.");
	if (!considered || !resets.length) return unknown("No enabled Codex account is verified for this model; reload quota with the model ID.");
	return { kind: "wait", resetAt: Math.min(...resets) };
}

/** Scheduler cooldowns alone are not evidence that a subscription quota is exhausted. */
export function hasConfirmedQuotaExhaustion(snapshot: QuotaSnapshot, modelId: string): boolean {
	return snapshot.accounts.some((account) => !account.disabled && account.eligible === true && !account.error && (
		account.allowed === false || account.windows.some((window) => window.scope !== "review" && window.label !== "Scheduler cooldown"
			&& (window.scope === "account" || (!!window.modelId && modelKey(window.modelId) === modelKey(modelId)))
			&& windowState(window, account) === "blocked")
	));
}

/** Plain text only; no raw credential metadata or upstream errors are rendered. */
export function formatQuotaSnapshot(snapshot: QuotaSnapshot, now = Date.now()): string {
	const instant = (time?: number) => time !== undefined && validTime(time) ? new Date(time).toISOString() : "unknown";
	const lines = [`Codex quota — checked ${instant(snapshot.checkedAt)}`];
	if (!snapshot.accounts.length) lines.push("No Codex accounts found.");
	for (const account of snapshot.accounts) {
		const status = account.disabled ? "disabled (not probed)"
			: account.eligible === false ? "not eligible for the requested model"
			: account.error ? "check unavailable; retry or check account authentication"
			: account.eligible === "unknown"
				? eligibilityModels.has(account) ? "model eligibility unknown" : "live quota checked"
				: "model eligibility verified";
		lines.push(`${publicText(account.label) || "Codex account"}: ${status}`);
		if (account.nextRetryAt !== undefined) lines.push(`  Scheduler retry: ${instant(account.nextRetryAt)}${account.nextRetryAt <= now ? " (refresh required)" : ""}`);
		if (account.hasCredits !== undefined) lines.push(`  Credits: ${account.hasCredits ? "available or unlimited" : "not available"}`);
		for (const window of account.windows) {
			const percent = window.usedPercent !== undefined && Number.isFinite(window.usedPercent) && window.usedPercent >= 0
				? `${Math.round(window.usedPercent * 10) / 10}% used` : "usage unknown";
			const scope = window.scope === "review" ? "review only" : window.scope === "model"
				? `model ${publicText(window.modelId) || "applicability unknown"}` : "account";
			const flag = window.allowed === true ? "; allowed" : window.allowed === false || window.limitReached === true ? "; limited" : "";
			lines.push(`  ${publicText(window.label) || "Quota window"} [${scope}]: ${percent}${flag}; reset ${instant(window.resetAt)}`);
		}
	}
	return lines.join("\n");
}
