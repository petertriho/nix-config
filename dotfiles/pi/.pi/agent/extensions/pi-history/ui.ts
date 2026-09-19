import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { sanitizePlainTerminalText } from "./model.ts";

export type ForegroundToken = Parameters<Theme["fg"]>[0];

/**
 * Local presentation primitives for pi-history.
 *
 * This intentionally mirrors the read-only pi-tmux-subagents, pi-tui-shell,
 * and pi-dashboard styling contract without coupling their extension modules.
 * Callers should render with the live theme and invalidate their own caches.
 */
export function span(
	theme: Theme,
	token: ForegroundToken,
	text: string,
): string {
	return theme.fg(token, text);
}

export function formatMetadata(theme: Theme, text: string): string {
	return span(theme, "muted", sanitizePlainTerminalText(text));
}

export function formatSeparator(theme: Theme, text = "·"): string {
	const safeText = sanitizePlainTerminalText(text) || "·";
	return span(theme, "dim", safeText);
}

export function formatKeyHint(
	theme: Theme,
	key: string,
	action: string,
): string {
	const safeKey = sanitizePlainTerminalText(key);
	const safeAction = sanitizePlainTerminalText(action);
	return span(theme, "dim", `${safeKey} ${safeAction}`.trim());
}

export function formatSavedCount(count: number): string {
	const normalized = Number.isFinite(count)
		? Math.max(0, Math.floor(count))
		: 0;
	return `${normalized} saved`;
}

export function selectedRowText(theme: Theme, text: string): string {
	return theme.bg("selectedBg", span(theme, "text", text));
}

export function safeWidth(width: number): number {
	return Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
}

/**
 * Select the first responsive candidate that fits. If none fit, truncate the
 * most compact candidate so optional information gives way before the title.
 */
export function chooseWidthCandidate(
	candidates: readonly string[],
	width: number,
): string {
	const available = safeWidth(width);
	if (available === 0 || candidates.length === 0) return "";
	const fitting = candidates.find(
		(candidate) => visibleWidth(candidate) <= available,
	);
	if (fitting !== undefined) return fitting;
	return truncateToWidth(candidates.at(-1) ?? "", available, "");
}

export function padToWidth(text: string, width: number): string {
	const available = safeWidth(width);
	if (available === 0) return "";
	const content = truncateToWidth(text, available, "");
	return `${content}${" ".repeat(Math.max(0, available - visibleWidth(content)))}`;
}

export function renderPanelTop(
	theme: Theme,
	width: number,
	title: string,
	info = "",
): string {
	const available = safeWidth(width);
	const border = (text: string) => span(theme, "borderMuted", text);
	if (available === 0) return "";
	if (available === 1) return border("╭");
	if (available === 2) return `${border("╭")}${border("╮")}`;

	const innerWidth = available - 2;
	const safeTitle = sanitizePlainTerminalText(title);
	const safeInfo = sanitizePlainTerminalText(info);
	const titleText = theme.bold(span(theme, "accent", safeTitle));
	const infoText = formatMetadata(theme, safeInfo);
	const left = `${border("─ ")}${titleText}${border(" ")}`;
	const right = safeInfo
		? `${border(" ")}${infoText}${border(" ─")}`
		: border("─");
	const fullWidth = visibleWidth(left) + visibleWidth(right);
	const full =
		fullWidth <= innerWidth
			? `${left}${border("─".repeat(innerWidth - fullWidth))}${right}`
			: "";
	const compact = safeInfo
		? `${titleText}${span(theme, "dim", " · ")}${infoText}`
		: titleText;
	const content = chooseWidthCandidate(
		full ? [full, compact, titleText] : [compact, titleText],
		innerWidth,
	);
	const fill = border(
		"─".repeat(Math.max(0, innerWidth - visibleWidth(content))),
	);
	return `${border("╭")}${content}${fill}${border("╮")}`;
}

export function renderPanelRow(
	theme: Theme,
	width: number,
	content: string,
): string {
	const available = safeWidth(width);
	const border = (text: string) => span(theme, "borderMuted", text);
	if (available === 0) return "";
	if (available === 1) return border("│");
	const innerWidth = available - 2;
	const padded =
		innerWidth >= 2
			? ` ${padToWidth(content, innerWidth - 2)} `
			: padToWidth(content, innerWidth);
	return `${border("│")}${padded}${border("│")}`;
}

export function renderPanelBottom(theme: Theme, width: number): string {
	const available = safeWidth(width);
	const border = (text: string) => span(theme, "borderMuted", text);
	if (available === 0) return "";
	if (available === 1) return border("╰");
	return `${border("╰")}${border("─".repeat(available - 2))}${border("╯")}`;
}

export function renderPanelDivider(theme: Theme, width: number): string {
	const available = safeWidth(width);
	const border = (text: string) => span(theme, "borderMuted", text);
	if (available === 0) return "";
	if (available === 1) return border("├");
	return `${border("├")}${border("─".repeat(available - 2))}${border("┤")}`;
}

/** Apply the shell/dashboard one-column transparent outer margin. */
export function applyPanelMargin(lines: readonly string[], width: number): string[] {
	const available = safeWidth(width);
	if (available === 0) return lines.map(() => "");
	if (available === 1) return lines.map((line) => (line ? " " : ""));

	const contentWidth = available - 2;
	return lines.map((line) => {
		if (line === "") return "";
		return ` ${padToWidth(line, contentWidth)} `;
	});
}
