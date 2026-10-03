import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, ScrollView, truncateToWidth, visibleWidth, wrapTextWithAnsi, type KeybindingsManager } from "@earendil-works/pi-tui";
import type { QuotaAccount, QuotaSnapshot, QuotaWindow } from "./quota.ts";

export type QuotaUIOptions = {
	inspect(signal: AbortSignal): Promise<QuotaSnapshot>;
	now?: () => number;
	scheduleTick?: (tick: () => void) => () => void;
};

// Only local configuration messages and the quota client's sanitized errors are displayable.
export class QuotaInspectionError extends Error {}
function inspectionError(error: unknown): string {
	return error instanceof QuotaInspectionError || error instanceof Error && error.name === "QuotaError"
		? safeText(error.message) : "Quota check failed; check the management API and retry.";
}

type Severity = "success" | "warning" | "error" | "muted";
export function presentQuotaWindow(window: QuotaWindow): { severity: Severity; usage: string; fillPercent?: number } {
	const percent = window.usedPercent;
	const limited = window.allowed === false || window.limitReached === true;
	if (percent === undefined || !Number.isFinite(percent) || percent < 0) {
		return { severity: limited ? "error" : "muted", usage: `usage unknown${limited ? " · limited" : ""}` };
	}
	const number = (value: number) => String(Number(value.toFixed(1)));
	return { severity: limited || percent >= 95 ? "error" : percent >= 80 ? "warning" : "success",
		usage: `${number(percent)}% used · ${number(Math.max(0, 100-percent))}% left${limited ? " · limited" : ""}`,
		fillPercent: Math.min(100, percent) };
}

function safeText(value: string): string {
	return stripVTControlCharacters(value).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
		.replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/\s+/g, " ").trim().slice(0, 160);
}
function instant(time?: number): string | undefined {
	return time !== undefined && Number.isFinite(time) && time >= 0 && time <= 8.64e15 ? new Date(time).toISOString() : undefined;
}
function duration(seconds: number): string {
	if (seconds % 86400 === 0) return `${seconds / 86400}d`;
	if (seconds % 3600 === 0) return `${seconds / 3600}h`;
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
}
function resetText(time: number | undefined, now: number): string {
	if (!instant(time) || !Number.isFinite(now)) return "reset unknown";
	if (time! <= now) return "refresh required";
	const seconds = (time! - now) / 1000;
	const remaining = seconds >= 86400 ? `${(seconds / 86400).toFixed(1)}d`
		: seconds >= 3600 ? `${(seconds / 3600).toFixed(1)}h`
		: seconds >= 60 ? `${(seconds / 60).toFixed(1)}m` : `${Math.ceil(seconds)}s`;
	return `reset in ${remaining}`;
}
function hasDetails(account: QuotaAccount): boolean {
	return account.windows.some((w) => w.scope !== "account" || instant(w.resetAt)) || account.hasCredits !== undefined || account.nextRetryAt !== undefined;
}

type ModalTUI = { terminal: { rows: number }; requestRender(): void };
const MIN_SPACIOUS_BODY_ROWS = 8;
export class QuotaModal {
	private readonly tui: ModalTUI;
	private readonly theme: Pick<Theme, "fg">;
	private readonly options: QuotaUIOptions;
	private readonly done: () => void;
	private readonly keys: Pick<KeybindingsManager, "matches" | "getKeys">;
	private selected = 0;
	private readonly expanded = new Set<string>();
	private cardStarts: number[] = [];
	private focusPending = false;
	private help = false;
	private savedScroll = 0;
	private snapshot?: QuotaSnapshot;
	private loading = true;
	private active = false;
	private stale = false;
	private error?: string;
	private generation = 0;
	private stopTick: () => void = () => {};
	private disposed = false;
	private readonly controller = new AbortController();
	private bodyLines: string[] = [];
	private readonly scroll = new ScrollView({ render: () => this.bodyLines, invalidate: () => {} }, { scrollbar: "hidden", overscroll: "contain" });

	constructor(tui: ModalTUI, theme: Pick<Theme, "fg">, keys: Pick<KeybindingsManager, "matches" | "getKeys">, done: () => void, options: QuotaUIOptions) {
		this.tui = tui; this.theme = theme; this.keys = keys; this.done = done; this.options = options;
		this.stopTick = (options.scheduleTick ?? ((tick) => {
			const timer = setInterval(tick, 1000); timer.unref(); return () => clearInterval(timer);
		}))(() => { if (!this.disposed) this.tui.requestRender(); });
		queueMicrotask(() => { void this.inspect(); });
	}
	private async inspect(): Promise<void> {
		if (this.disposed || this.active) return;
		this.active = true; this.loading = true; this.error = undefined;
		const generation = ++this.generation;
		this.tui.requestRender();
		try {
			const snapshot = await this.options.inspect(this.controller.signal);
			if (this.disposed || generation !== this.generation) return;
			const focused = this.snapshot?.accounts[this.selected]?.authIndex;
			const selected = snapshot.accounts.findIndex((a) => a.authIndex === focused);
			this.selected = selected >= 0 ? selected : Math.min(this.selected, Math.max(0, snapshot.accounts.length - 1));
			if (focused && selected < 0) this.focusPending = true;
			const ids = new Set(snapshot.accounts.map((a) => a.authIndex));
			for (const id of this.expanded) if (!ids.has(id)) this.expanded.delete(id);
			this.snapshot = snapshot; this.stale = false;
		} catch (error) {
			if (!this.disposed && generation === this.generation) { this.error = inspectionError(error); this.stale = !!this.snapshot; }
		} finally {
			if (!this.disposed && generation === this.generation) { this.active = false; this.loading = false; this.tui.requestRender(); }
		}
	}
	private windowLines(window: QuotaWindow, width: number, expanded: boolean): string[] {
		const scope = window.scope === "review" ? "review only" : window.scope === "model" ? `model ${safeText(window.modelId ?? "") || "applicability unknown"}` : "account";
		if (window.label === "Scheduler cooldown") return wrapTextWithAnsi(`Scheduler cooldown [${scope}] (not subscription quota): ${resetText(window.resetAt, (this.options.now ?? Date.now)())}${instant(window.resetAt) ? ` · ${instant(window.resetAt)}` : ""}`, width).map((s) => this.theme.fg("warning", s));
		const shown = presentQuotaWindow(window);
		const label = safeText(window.label) || "Quota window";
		const span = window.durationSeconds !== undefined && Number.isFinite(window.durationSeconds) && window.durationSeconds > 0
			? ` · ${duration(window.durationSeconds)}` : "";
		const lines = wrapTextWithAnsi(`${label}${span} [${scope}]`, width).map((s) => this.theme.fg("muted", s));
		const usage = width < 32 ? shown.usage.split(" · ").filter((_s, i) => i !== 1 || shown.fillPercent === undefined).join(" · ") : shown.usage;
		if (shown.fillPercent !== undefined && width >= 12) {
			const cells = Math.min(24, Math.max(4, width - visibleWidth(usage) - 3));
			const fill = Math.round(cells * shown.fillPercent / 100);
			const bar = this.theme.fg(shown.severity, "━".repeat(fill)) + this.theme.fg("dim", "─".repeat(cells - fill));
			if (visibleWidth(usage) + cells + 2 <= width) lines.push(`${bar}  ${this.theme.fg(shown.severity, usage)}`);
			else { lines.push(bar); lines.push(...wrapTextWithAnsi(usage, width).map((s) => this.theme.fg(shown.severity, s))); }
		} else lines.push(...wrapTextWithAnsi(usage, width).map((s) => this.theme.fg(shown.severity, s)));
		lines.push(...wrapTextWithAnsi(resetText(window.resetAt, (this.options.now ?? Date.now)()), width).map((s) => this.theme.fg("dim", s)));
		if (expanded && instant(window.resetAt)) lines.push(...wrapTextWithAnsi(`Reset at ${instant(window.resetAt)}`, width).map((s) => this.theme.fg("dim", s)));
		return lines;
	}
	private cards(width: number, spacious: boolean): string[] {
		const errors = this.error ? wrapTextWithAnsi(`${this.error} r retry · Esc/q close`, width).map((s) => this.theme.fg("error", s)) : [];
		if (!this.snapshot) return errors.length ? errors : wrapTextWithAnsi("Loading live quota…", width).map((s) => this.theme.fg("muted", s));
		if (!this.snapshot.accounts.length) return [...errors, ...wrapTextWithAnsi("No Codex accounts found. r refresh · q close", width)];
		const lines: string[] = [...errors];
		this.cardStarts = [];
		for (const [i, account] of this.snapshot.accounts.entries()) {
			if (i) {
				if (spacious) lines.push("");
				lines.push(this.theme.fg("dim", "─".repeat(Math.min(48, width))));
				if (spacious) lines.push("");
			}
			this.cardStarts.push(lines.length);
			const expanded = this.expanded.has(account.authIndex);
			const state = account.disabled ? "disabled (not probed)" : account.error ? "check failed"
				: account.unavailable ? "unavailable · live usage checked" : "live usage checked";
			const header = `${i === this.selected ? "›" : " "} ${hasDetails(account) ? expanded ? "▾" : "▸" : "·"} ${safeText(account.label) || "Codex account"} · ${state}${account.unavailable && account.error ? " · unavailable" : ""}`;
			lines.push(...wrapTextWithAnsi(header, width).map((s) => this.theme.fg(i === this.selected ? "accent" : "text", s)));
			if (account.error) lines.push(...wrapTextWithAnsi(safeText(account.error), width).map((s) => this.theme.fg("error", s)));
			if (expanded && !account.disabled && account.nextRetryAt !== undefined) lines.push(...wrapTextWithAnsi(`Scheduler retry (not subscription quota): ${resetText(account.nextRetryAt, (this.options.now ?? Date.now)())}${instant(account.nextRetryAt) ? ` · ${instant(account.nextRetryAt)}` : ""}`, width).map((s) => this.theme.fg("warning", s)));
			if (account.disabled) continue;
			if (account.error) {
				if (expanded) for (const window of account.windows.filter((w) => w.label === "Scheduler cooldown"))
					lines.push(...this.windowLines(window, width, true));
				continue;
			}
			if (account.allowed === false) lines.push(...wrapTextWithAnsi("Generation: explicitly limited", width).map((s) => this.theme.fg("error", s)));
			const generation = account.windows.filter((w) => w.scope === "account" && w.label !== "Scheduler cooldown");
			if (!generation.length) lines.push(...wrapTextWithAnsi("Generation windows unavailable · usage unknown", width).map((s) => this.theme.fg("muted", s)));
			for (const window of generation) lines.push(...this.windowLines(window, width, expanded));
			if (expanded) {
				for (const window of account.windows.filter((w) => !generation.includes(w))) lines.push(...this.windowLines(window, width, true));
				if (account.hasCredits !== undefined) lines.push(...wrapTextWithAnsi(`Credits: ${account.hasCredits ? "available or unlimited" : "not available"}`, width).map((s) => this.theme.fg("muted", s)));
			}
		}
		return lines;
	}
	render(availableWidth: number): string[] {
		if (this.disposed || availableWidth <= 0) return [];
		const outer = Math.min(104, availableWidth);
		const height = Math.max(1, Math.min(this.tui.terminal.rows, this.tui.terminal.rows - 2, Math.floor(this.tui.terminal.rows * .85)));
		const boxed = outer >= 14 && height >= 7;
		const width = Math.max(1, outer - (boxed ? 4 : 0));
		const budget = height - (boxed ? 2 : 0);
		const header: string[] = [];
		if (budget >= 5) header.push(this.theme.fg("accent", "CODEX QUOTA · account inspection"));
		if (budget >= 3) {
			const elapsed = this.snapshot ? ((this.options.now ?? Date.now)() - this.snapshot.checkedAt) / 1000 : NaN;
			const age = Number.isFinite(elapsed) ? `${Math.max(0, Math.floor(elapsed))}s old` : "age unknown";
			const stamp = this.snapshot && instant(this.snapshot.checkedAt);
			const state = this.stale ? "Stale · " : this.loading && this.snapshot ? "Refreshing · " : "";
			const status = !this.snapshot ? this.loading ? "Loading… · not checked" : "Check failed · r retry"
				: width >= 78 ? `${state}Checked ${stamp ?? "unknown"} · ${age}` : `${state}${age}`;
			header.push(this.theme.fg(this.stale ? "warning" : "muted", status));
		}
		const footer = budget >= 2 ? [this.theme.fg("dim", width >= 68 ? "↑↓/jk move · Enter details · r refresh · ? help · Esc/q close" : width >= 25 ? "r refresh · Esc/q close · ? help" : width >= 5 ? "r q ?" : "q")] : [];
		if (budget - header.length - footer.length >= MIN_SPACIOUS_BODY_ROWS + 2) {
			header.push("");
			footer.unshift("");
		}
		const viewport = Math.max(1, budget - header.length - footer.length);
		this.bodyLines = (this.help ? this.helpLines(width) : this.cards(width, viewport >= MIN_SPACIOUS_BODY_ROWS)).map((s) => truncateToWidth(s, width, ""));
		this.scroll.updateLayout(this.bodyLines.length, viewport, () => { if (!this.disposed) this.tui.requestRender(); });
		if (this.focusPending && !this.help) {
			const start = this.cardStarts[this.selected] ?? 0;
			if (start < this.scroll.scrollTop || start >= this.scroll.scrollTop + viewport) this.scroll.scrollTo(start);
			this.focusPending = false;
		}
		// ScrollView owns clamping and paging; custom line composition clips its viewport here.
		const body = this.scroll.render(width).slice(this.scroll.scrollTop, this.scroll.scrollTop + viewport);
		const content = [...header, ...body, ...footer].map((s) => truncateToWidth(s, width, ""));
		const pad = " ".repeat(Math.max(0, Math.floor((availableWidth - outer) / 2)));
		if (!boxed) return content.slice(0, height).map((s) => pad + s);
		return [this.theme.fg("borderAccent", `╭${"─".repeat(outer - 2)}╮`), ...content.map((s) =>
			`${this.theme.fg("borderAccent", "│")} ${s}${" ".repeat(Math.max(0, width - visibleWidth(s)))} ${this.theme.fg("borderAccent", "│")}`),
			this.theme.fg("borderAccent", `╰${"─".repeat(outer - 2)}╯`)].map((s) => pad + s);
	}
	private helpLines(width: number): string[] {
		const bindings = (action: "up" | "down" | "confirm" | "pageUp" | "pageDown") => this.keys.getKeys(`tui.select.${action}`).join("/") || "unbound";
		return ["LOCAL SHORTCUTS", `${bindings("up")}/${bindings("down")} · k/j: move account focus`, `${bindings("confirm")}: toggle details`, "Right/l: expand · Left/h: collapse", `${bindings("pageUp")}/${bindings("pageDown")}: page within cards`, "Home/End: first/last account", "r: refresh (one live check at a time)", "?: toggle help · Esc/q: close", "Countdowns are local. Elapsed resets require refresh.", "Account inspection does not select a routed account or verify model readiness."].flatMap((s) => wrapTextWithAnsi(s, width).map((line) => this.theme.fg("muted", line)));
	}
	handleInput(data: string): void {
		if (this.disposed) return;
		if (data === "q" || matchesKey(data, Key.escape) || this.keys.matches(data, "tui.select.cancel")) { this.close(); return; }
		if (data === "r") { void this.inspect(); return; }
		if (data === "?") {
			this.help = !this.help;
			if (this.help) { this.savedScroll = this.scroll.scrollTop; this.scroll.scrollToStart(); }
			else { this.scroll.scrollTo(this.savedScroll); this.focusPending = true; }
		} else if (this.keys.matches(data, "tui.select.pageDown")) this.scroll.scrollBy(Math.max(1, this.scroll.viewportHeight - 1));
		else if (this.keys.matches(data, "tui.select.pageUp")) this.scroll.scrollBy(-Math.max(1, this.scroll.viewportHeight - 1));
		else if (this.keys.matches(data, "tui.select.down") || data === "j") { this.selected = Math.min(this.selected + 1, Math.max(0, (this.snapshot?.accounts.length ?? 0) - 1)); this.focusPending = true; }
		else if (this.keys.matches(data, "tui.select.up") || data === "k") { this.selected = Math.max(0, this.selected - 1); this.focusPending = true; }
		else if (matchesKey(data, Key.home)) { this.selected = 0; this.focusPending = true; }
		else if (matchesKey(data, Key.end)) { this.selected = Math.max(0, (this.snapshot?.accounts.length ?? 0) - 1); this.focusPending = true; }
		else if (this.keys.matches(data, "tui.select.confirm") || matchesKey(data, Key.right) || matchesKey(data, Key.left) || data === "l" || data === "h") {
			const account = this.snapshot?.accounts[this.selected];
			if (!account || !hasDetails(account)) return;
			const expand = matchesKey(data, Key.right) || data === "l" ? true : matchesKey(data, Key.left) || data === "h" ? false : !this.expanded.has(account.authIndex);
			if (expand) this.expanded.add(account.authIndex); else this.expanded.delete(account.authIndex);
			this.focusPending = true;
		} else return;
		this.tui.requestRender();
	}
	invalidate(): void { /* All theme styling is evaluated at render time. */ }
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true; ++this.generation; this.controller.abort(); this.stopTick();
	}
	close(): void { if (this.disposed) return; this.dispose(); this.done(); }
}
