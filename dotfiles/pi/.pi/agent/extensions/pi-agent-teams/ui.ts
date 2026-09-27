import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

export type UiTheme = ExtensionContext["ui"]["theme"];
export type ForegroundToken = Parameters<UiTheme["fg"]>[0];

export type SemanticState =
  | "starting"
  | "running"
  | "active"
  | "waiting"
  | "help"
  | "stalled"
  | "completed"
  | "failed";

export type StatePresentation = Readonly<{
  glyph: string;
  label: string;
  token: ForegroundToken;
}>;

export const STATE_PRESENTATIONS = {
  starting: { glyph: "○", label: "starting", token: "accent" },
  running: { glyph: "◌", label: "running", token: "accent" },
  active: { glyph: "●", label: "active", token: "success" },
  waiting: { glyph: "◐", label: "waiting", token: "muted" },
  help: { glyph: "?", label: "needs help", token: "warning" },
  stalled: { glyph: "!", label: "stalled", token: "error" },
  completed: { glyph: "✓", label: "completed", token: "success" },
  failed: { glyph: "✗", label: "failed", token: "error" },
} as const satisfies Record<SemanticState, StatePresentation>;

// Removes C0, DEL, and C1 controls after Pi TUI has stripped ESC-prefixed CSI,
// OSC, and related terminal sequences. Newlines are intentionally excluded so
// display-only multi-line summaries keep their original line structure.
// biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal display hardening.
const DISPLAY_CONTROL_PATTERN = /[\x00-\x09\x0b-\x1f\x7f-\x9f]/g;
// Pi TUI strips styling and hyperlinks. This supplemental expression removes
// non-styling CSI cursor controls and malformed sequences the utility leaves
// intact before the remaining control bytes are replaced.
// biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal display hardening.
const DISPLAY_ESCAPE_PATTERN =
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)?|P[^\x1b]*(?:\x1b\\)?|[_^X][^\x1b]*(?:\x1b\\)?)/g;

export function span(
  theme: UiTheme,
  token: ForegroundToken,
  text: string,
): string {
  return theme.fg(token, text);
}

function sanitizeDisplayFragment(text: string): string {
  return stripTerminalSequences(text)
    .replace(DISPLAY_ESCAPE_PATTERN, "")
    .replace(DISPLAY_CONTROL_PATTERN, " ");
}

/** Sanitize one presentation line without allowing input to add another row. */
export function sanitizeDisplayLine(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(sanitizeDisplayFragment)
    .join(" ")
    .replace(/ +/g, " ")
    .trim();
}

/** Sanitize presentation text while preserving its existing newline count. */
export function sanitizeDisplayText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => sanitizeDisplayFragment(line).replace(/ +/g, " ").trim())
    .join("\n");
}

export function formatIdentity(
  theme: UiTheme,
  name: string,
  role?: string,
): string {
  const safeName = sanitizeDisplayLine(name);
  const safeRole = sanitizeDisplayLine(role ?? "");
  const identity = theme.bold(span(theme, "toolTitle", safeName));
  return safeRole
    ? `${identity}${span(theme, "dim", ` (${safeRole})`)}`
    : identity;
}

export function formatMetadata(theme: UiTheme, text: string): string {
  return span(theme, "muted", sanitizeDisplayLine(text));
}

export function formatSeparator(theme: UiTheme, text = " · "): string {
  const separatorText = sanitizeDisplayLine(text) || "·";
  return span(theme, "dim", ` ${separatorText} `);
}

export function formatKeyHint(
  theme: UiTheme,
  key: string,
  action: string,
): string {
  const safeKey = sanitizeDisplayLine(key);
  const safeAction = sanitizeDisplayLine(action);
  return span(theme, "dim", `${safeKey} ${safeAction}`.trim());
}

export function formatState(
  theme: UiTheme,
  state: SemanticState,
  options: { glyphOnly?: boolean; label?: string } = {},
): string {
  const presentation = STATE_PRESENTATIONS[state];
  if (options.glyphOnly) {
    return span(theme, presentation.token, presentation.glyph);
  }
  const label = sanitizeDisplayLine(options.label ?? presentation.label);
  return span(
    theme,
    presentation.token,
    label ? `${presentation.glyph} ${label}` : presentation.glyph,
  );
}

export function formatStateLabel(
  theme: UiTheme,
  state: SemanticState,
  label?: string,
): string {
  const presentation = STATE_PRESENTATIONS[state];
  return span(
    theme,
    presentation.token,
    sanitizeDisplayLine(label ?? presentation.label),
  );
}

function safeWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
}

/**
 * Select the first candidate that fits. If none fit, truncate the most compact
 * candidate rather than the richest one so responsive priority remains stable.
 */
export function chooseWidthCandidate(
  candidates: readonly string[],
  width: number,
): string {
  const available = safeWidth(width);
  if (available === 0 || candidates.length === 0) return "";
  const fitting = candidates.find((candidate) => visibleWidth(candidate) <= available);
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
  theme: UiTheme,
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
  const safeTitle = sanitizeDisplayLine(title);
  const safeInfo = sanitizeDisplayLine(info);
  const titleText = theme.bold(span(theme, "accent", safeTitle));
  const infoText = formatMetadata(theme, safeInfo);
  const left = `${border("─ ")}${titleText}${border(" ")}`;
  const right = safeInfo ? `${border(" ")}${infoText}${border(" ─")}` : border("─");
  const fullWidth = visibleWidth(left) + visibleWidth(right);
  const full =
    fullWidth <= innerWidth
      ? `${left}${border("─".repeat(innerWidth - fullWidth))}${right}`
      : "";
  const compact = safeInfo
    ? `${titleText}${formatSeparator(theme)}${infoText}`
    : titleText;
  const minimal = titleText;
  const content = chooseWidthCandidate(
    full ? [full, compact, minimal] : [compact, minimal],
    innerWidth,
  );
  const fill = border("─".repeat(Math.max(0, innerWidth - visibleWidth(content))));
  return `${border("╭")}${content}${fill}${border("╮")}`;
}

export function renderPanelRow(
  theme: UiTheme,
  width: number,
  content: string,
): string {
  const available = safeWidth(width);
  const border = (text: string) => span(theme, "borderMuted", text);
  if (available === 0) return "";
  if (available === 1) return border("│");

  return `${border("│")}${padToWidth(content, available - 2)}${border("│")}`;
}

export function renderPanelBottom(theme: UiTheme, width: number): string {
  const available = safeWidth(width);
  const border = (text: string) => span(theme, "borderMuted", text);
  if (available === 0) return "";
  if (available === 1) return border("╰");
  return `${border("╰")}${border("─".repeat(available - 2))}${border("╯")}`;
}

/** Apply the shell/dashboard one-column transparent outer margin. */
export function applyPanelMargin(lines: string[], width: number): string[] {
  const available = safeWidth(width);
  if (available === 0) return lines.map(() => "");
  if (available === 1) return lines.map((line) => (line ? " " : ""));

  const contentWidth = available - 2;
  return lines.map((line) => {
    if (line === "") return "";
    return ` ${padToWidth(line, contentWidth)} `;
  });
}
