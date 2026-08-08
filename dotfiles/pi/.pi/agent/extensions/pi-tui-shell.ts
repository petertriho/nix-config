import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
  SessionManager,
  type SessionInfo,
  VERSION,
} from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteProvider,
  Component,
  EditorComponent,
  EditorTheme,
  Focusable,
  TUI,
} from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Factory pi stores via `ctx.ui.setEditorComponent`. Not re-exported by the
 * public packages, so it is mirrored here from pi's `ExtensionUIContext`.
 */
type EditorFactory = (
  tui: TUI,
  theme: EditorTheme,
  keybindings: KeybindingsManager,
) => EditorComponent;

export type ModelInfo = {
  provider: string;
  id: string;
  contextWindow: number;
};

export type ContextDisplay = {
  text: string;
  percent: number | null;
};

export type SessionUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type ShellTheme = ExtensionContext["ui"]["theme"];
type FrameTheme = ShellTheme;
type FrameColor = Parameters<FrameTheme["fg"]>[0];
export type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type BorderPriority = "left" | "right";
export type LifecycleState = "ready" | "working" | "settling";

type LifecycleTimers = {
  now(): number;
  setInterval(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
};

export type LifecycleController = {
  readonly state: LifecycleState;
  readonly spinnerIndex: number;
  readonly timerActive: boolean;
  readonly turnStartedAt: number | undefined;
  start(): void;
  end(): void;
  settle(): void;
  reset(): void;
};

export type DashboardSession = {
  title: string;
  age: string;
  messageCount: number;
};

export type DashboardData = {
  version: string;
  recentSessions: DashboardSession[];
  sessionsLoading: boolean;
};

export function formatSessionAge(date: Date, now = Date.now()): string {
  const elapsedMs = Math.max(0, now - date.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(elapsedMs / 3_600_000);
  const days = Math.floor(elapsedMs / 86_400_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function recentDashboardSessions(
  sessions: SessionInfo[],
  currentSessionFile: string | undefined,
): DashboardSession[] {
  return sessions
    .filter((session) => session.path !== currentSessionFile)
    .slice(0, 3)
    .map((session) => ({
      title:
        sanitizeStatusText(session.name ?? session.firstMessage) ||
        "Untitled session",
      age: formatSessionAge(session.modified),
      messageCount: session.messageCount,
    }));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: Matches ANSI SGR resets in rendered TUI lines.
const ANSI_BACKGROUND_RESET_PATTERN = /\x1b\[(?:0|49)?m/g;

export function createLifecycleController(
  onChange: () => void,
  timers: LifecycleTimers = {
    now: Date.now,
    setInterval,
    clearInterval,
  },
): LifecycleController {
  let state: LifecycleState = "ready";
  let spinnerIndex = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | undefined;
  let turnStartedAt: number | undefined;

  const stopTimer = () => {
    if (spinnerTimer === undefined) return;
    timers.clearInterval(spinnerTimer);
    spinnerTimer = undefined;
  };

  const startTimer = () => {
    if (spinnerTimer !== undefined) return;
    spinnerIndex = 0;
    spinnerTimer = timers.setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % 10;
      onChange();
    }, 80);
  };

  return {
    get state() {
      return state;
    },
    get spinnerIndex() {
      return spinnerIndex;
    },
    get timerActive() {
      return spinnerTimer !== undefined;
    },
    get turnStartedAt() {
      return turnStartedAt;
    },
    start() {
      state = "working";
      turnStartedAt ??= timers.now();
      startTimer();
      onChange();
    },
    end() {
      state = "settling";
      onChange();
    },
    settle() {
      state = "ready";
      turnStartedAt = undefined;
      stopTimer();
      onChange();
    },
    reset() {
      state = "ready";
      spinnerIndex = 0;
      turnStartedAt = undefined;
      stopTimer();
      onChange();
    },
  };
}

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function formatCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;

  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const relativeToHome = relative(resolvedHome, resolvedCwd);
  const isInsideHome =
    relativeToHome === "" ||
    (relativeToHome !== ".." &&
      !relativeToHome.startsWith(`..${sep}`) &&
      !isAbsolute(relativeToHome));

  if (!isInsideHome) return cwd;
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function span(theme: FrameTheme, color: FrameColor, text: string): string {
  return theme.fg(color, text);
}

function separator(theme: FrameTheme, text = " · "): string {
  return span(theme, "dim", text);
}

function thinkingLevelText(theme: FrameTheme, level: ThinkingLevel): string {
  return theme.getThinkingBorderColor(level)(level);
}

function tailToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;

  const graphemes = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    ({ segment }) => segment,
  );
  let tail = "";

  for (let index = graphemes.length - 1; index >= 0; index -= 1) {
    const candidate = `${graphemes[index]}${tail}`;
    if (visibleWidth(candidate) > width) break;
    tail = candidate;
  }

  return tail;
}

function compactCwd(cwd: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(cwd) <= width) return cwd;

  const homePrefix = cwd.startsWith(`~${sep}`) ? `~${sep}` : "";
  const rootPrefix = homePrefix === "" && cwd.startsWith(sep) ? sep : "";
  const parts = cwd.split(sep).filter((part) => part !== "" && part !== "~");
  const tail = parts.at(-1) ?? cwd;
  const marker = `${homePrefix || rootPrefix}…${sep}`;
  const markerWidth = visibleWidth(marker);

  if (markerWidth >= width) {
    return truncateToWidth(homePrefix ? `${homePrefix}…` : "…", width, "");
  }

  return `${marker}${tailToWidth(tail, width - markerWidth)}`;
}

/**
 * Map a pi-vim `vimState.mode` value to a short display label.
 *
 * Duck-typed (no pi-vim import): the caller reads `(inner as any).vimState?.mode`
 * and passes the raw string here. Unknown/missing modes yield no label.
 */
const VIM_MODE_LABELS: Record<string, string> = {
  normal: "NORMAL",
  insert: "INSERT",
  visual: "VISUAL",
  "visual-line": "VISUAL-LN",
  replace: "REPLACE",
  "command-line": "SEARCH",
};

/**
 * Per-mode semantic theme color for the vim mode label, mirroring heirline's
 * vimode.lua mode→hue convention (blue/green/purple/yellow/red) via pi theme
 * tokens. Pi has no general-purpose purple, so visual mode borrows
 * `customMessageLabel` — the only token reliably purple in both themes.
 */
const VIM_MODE_COLORS: Record<string, FrameColor> = {
  normal: "accent",
  insert: "success",
  visual: "customMessageLabel",
  "visual-line": "customMessageLabel",
  replace: "error",
  "command-line": "warning",
};

function vimModeLabel(mode: string | undefined): string | undefined {
  return mode ? VIM_MODE_LABELS[mode] : undefined;
}

function vimModeColor(mode: string | undefined): FrameColor {
  return (mode && VIM_MODE_COLORS[mode]) || "accent";
}

export function editorBottomLeftText(
  theme: FrameTheme,
  cwd: string,
  width?: number,
  modeLabel?: string,
  modeColor: FrameColor = "accent",
): string {
  // Unconstrained: render the full bottom-left, with an optional leftmost
  // mode label ahead of the cwd (e.g. ` NORMAL · ~/proj `).
  if (width === undefined) {
    const body = modeLabel
      ? `${span(theme, modeColor, modeLabel)}${separator(theme)}${span(theme, "accent", cwd)}`
      : span(theme, "accent", cwd);
    return ` ${body} `;
  }
  if (width <= 0) return "";

  const horizontalPadding = width >= 2 ? 2 : 0;
  const contentWidth = width - horizontalPadding;
  const leftPadding = horizontalPadding > 0 ? " " : "";
  const rightPadding = leftPadding;

  if (!modeLabel) {
    return `${leftPadding}${span(theme, "accent", compactCwd(cwd, contentWidth))}${rightPadding}`;
  }

  // Preserve the mode label; truncate the cwd first when space is tight.
  const sep = separator(theme);
  const modeWidth = visibleWidth(modeLabel);
  const sepWidth = visibleWidth(sep);

  if (contentWidth <= modeWidth) {
    // Not enough room for the label plus cwd; show the label truncated to fit.
    const truncated = truncateToWidth(modeLabel, contentWidth, "");
    return `${leftPadding}${span(theme, modeColor, truncated)}${rightPadding}`;
  }

  const cwdBudget = contentWidth - modeWidth - sepWidth;
  if (cwdBudget <= 0) {
    // Room for the label itself but not label + separator + cwd; show only the
    // (already-fitting) label rather than overflowing into the separator.
    return `${leftPadding}${span(theme, modeColor, modeLabel)}${rightPadding}`;
  }
  const cwdText = compactCwd(cwd, cwdBudget);
  return `${leftPadding}${span(theme, modeColor, modeLabel)}${sep}${span(theme, "accent", cwdText)}${rightPadding}`;
}

export function editorTopLeftText(
  theme: FrameTheme,
  model: ModelInfo | undefined,
): string {
  const identity = model
    ? `${span(theme, "accent", model.provider)}${span(theme, "dim", "/")}${span(theme, "text", model.id)}`
    : span(theme, "muted", "no model");
  return ` ${identity} `;
}

export function editorBottomRightText(
  theme: FrameTheme,
  usage: SessionUsage,
  elapsedMs?: number,
): string {
  const usageStats = [
    `${span(theme, "accent", "↑")}${span(theme, "text", formatTokens(usage.input))}`,
    `${span(theme, "success", "↓")}${span(theme, "text", formatTokens(usage.output))}`,
    `${span(theme, "muted", "R")}${span(theme, "text", formatTokens(usage.cacheRead))}`,
    `${span(theme, "muted", "W")}${span(theme, "text", formatTokens(usage.cacheWrite))}`,
  ].join(separator(theme, " "));
  const turnTime =
    elapsedMs === undefined
      ? ""
      : `${separator(theme)}${span(theme, "text", formatDuration(elapsedMs))}`;
  return ` ${usageStats}${turnTime}${separator(theme)}${span(theme, "muted", "$")}${span(theme, "text", usage.cost.toFixed(3))} `;
}

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

export function applyOuterMargin(lines: string[], width: number): string[] {
  if (width <= 0) return lines.map(() => "");
  if (width === 1) return lines.map((line) => (line ? " " : ""));

  const contentWidth = width - 2;
  return lines.map((line) => {
    if (line === "") return "";
    const content = truncateToWidth(line, contentWidth, "");
    const padding = " ".repeat(
      Math.max(0, contentWidth - visibleWidth(content)),
    );
    return ` ${content}${padding} `;
  });
}

function renderStatusFooterContent(
  theme: ShellTheme,
  lifecycle: LifecycleState,
  spinnerFrame: string,
  statuses: Iterable<string>,
  width: number,
): string[] {
  if (width <= 0) return [""];

  const stateText =
    lifecycle === "ready"
      ? span(theme, "success", lifecycle)
      : `${spinnerFrame} ${span(theme, "accent", lifecycle)}`;
  const fittedState = truncateToWidth(stateText, width, "");
  const statusSeparator = separator(theme);
  const statusText = Array.from(statuses)
    .map((s) => sanitizeStatusText(s).replace(/^\s*·\s*/, ""))
    .filter((status) => visibleWidth(status) > 0)
    .join(statusSeparator);
  const statusBudget =
    width - visibleWidth(fittedState) - visibleWidth(statusSeparator);
  const fittedStatus =
    statusBudget > 0 ? truncateToWidth(statusText, statusBudget, "") : "";
  const suffix = fittedStatus ? `${statusSeparator}${fittedStatus}` : "";

  return [`${fittedState}${suffix}`];
}

export function renderStatusFooter(
  theme: ShellTheme,
  lifecycle: LifecycleState,
  spinnerFrame: string,
  statuses: Iterable<string>,
  width: number,
): string[] {
  const contentWidth = Math.max(0, width - 2);
  return applyOuterMargin(
    renderStatusFooterContent(
      theme,
      lifecycle,
      spinnerFrame,
      statuses,
      contentWidth,
    ),
    width,
  );
}

function renderDashboardContent(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
): string[] {
  if (width <= 0) return ["", ""];

  const fit = (line: string) => truncateToWidth(line, width, "");
  const logoRows = (
    width >= 70
      ? ["██████  ", "██  ██  ", "████  ██", "██    ██"]
      : ["███ ", "█ █ ", "██ █", "█  █"]
  ).map((line) => span(theme, "accent", line));
  logoRows.push(span(theme, "dim", `v${data.version}`));

  const contentRows = (contentWidth: number) => {
    const recentRows = data.sessionsLoading
      ? [span(theme, "muted", "Loading recent sessions…")]
      : data.recentSessions.length === 0
        ? [span(theme, "muted", "No recent sessions yet")]
        : data.recentSessions.map((session, index) => {
            const marker =
              index === 0
                ? span(theme, "accent", "●")
                : span(
                    theme,
                    "dim",
                    index === data.recentSessions.length - 1 ? "└" : "│",
                  );
            const count = `${session.messageCount} ${session.messageCount === 1 ? "msg" : "msgs"}`;
            const metadata = `${session.age} · ${count}`;
            const metadataWidth = visibleWidth(metadata);
            const titleWidth = Math.max(
              0,
              contentWidth - visibleWidth(marker) - metadataWidth - 4,
            );
            const title = truncateToWidth(
              sanitizeStatusText(session.title),
              titleWidth,
              "",
            );
            const styledTitle = span(
              theme,
              index === 0 ? "accent" : "text",
              title,
            );
            const padding = " ".repeat(
              Math.max(
                2,
                contentWidth -
                  visibleWidth(marker) -
                  visibleWidth(title) -
                  metadataWidth -
                  1,
              ),
            );
            return `${marker} ${styledTitle}${padding}${span(theme, "dim", metadata)}`;
          });

    return [
      span(theme, "muted", "recent sessions"),
      ...recentRows,
      `${span(theme, "accent", "/resume")} ${span(theme, "dim", "open a session")}`,
    ];
  };

  if (width >= 50) {
    const logoWidth = Math.max(...logoRows.map(visibleWidth));
    const availableContentWidth = Math.max(0, width - logoWidth - 3);
    const rowsContent = contentRows(availableContentWidth);
    const rowCount = Math.max(logoRows.length, rowsContent.length);
    const rows = Array.from({ length: rowCount }, (_, index) => {
      const logo = logoRows[index] ?? " ".repeat(logoWidth);
      const content = rowsContent[index] ?? "";
      return fit(`${logo}${content ? "   " : ""}${content}`);
    });
    return ["", ...rows, ""];
  }

  return ["", ...logoRows.map(fit), "", ...contentRows(width).map(fit), ""];
}

export function renderDashboard(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
): string[] {
  const contentWidth = Math.max(0, width - 2);
  return applyOuterMargin(
    renderDashboardContent(theme, data, contentWidth),
    width,
  );
}

export function createDashboardComponent(
  theme: ShellTheme,
  getData: () => DashboardData,
): Component {
  return {
    render(width: number): string[] {
      return renderDashboard(theme, getData(), width);
    },
    invalidate(): void {},
  };
}

function usageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addUsage(totals: SessionUsage, usage: unknown): void {
  const value = usage as
    | {
        input?: unknown;
        output?: unknown;
        cacheRead?: unknown;
        cacheWrite?: unknown;
        cost?: { total?: unknown };
      }
    | undefined;

  totals.input += usageNumber(value?.input);
  totals.output += usageNumber(value?.output);
  totals.cacheRead += usageNumber(value?.cacheRead);
  totals.cacheWrite += usageNumber(value?.cacheWrite);
  totals.cost += usageNumber(value?.cost?.total);
}

function computeSessionUsage(ctx: ExtensionContext): SessionUsage {
  const totals: SessionUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message") {
      if (
        entry.message.role === "assistant" ||
        entry.message.role === "toolResult"
      ) {
        addUsage(totals, entry.message.usage);
      }
    } else if (
      (entry.type === "branch_summary" || entry.type === "compaction") &&
      entry.usage
    ) {
      addUsage(totals, entry.usage);
    }
  }

  return totals;
}

function formatDuration(elapsedMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes < 60) return `${minutes}m${seconds}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

function formatContext(
  ctx: ExtensionContext,
  model: ModelInfo | undefined,
): ContextDisplay {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? model?.contextWindow;

  if (!contextWindow) return { text: "?", percent: null };

  const limit = formatTokens(contextWindow);
  if (!usage || usage.percent === null) {
    return { text: `?/${limit}`, percent: null };
  }

  return {
    text: `${usage.percent.toFixed(1)}%/${limit}`,
    percent: usage.percent,
  };
}

function fitBorder(
  left: string,
  right: string,
  width: number,
  border: (text: string) => string,
  leftCorner: string,
  rightCorner: string,
  priority: BorderPriority,
  truncateLeft?: (width: number) => string,
): string {
  if (width <= 0) return "";
  if (width === 1) return border(leftCorner);

  const innerWidth = width - 2;
  let leftText = left;
  let rightText = right;
  let leftWidth = visibleWidth(leftText);
  let rightWidth = visibleWidth(rightText);
  let minimumGap = leftWidth > 0 && rightWidth > 0 ? 1 : 0;

  const fitLeft = () => {
    const maximumWidth = Math.max(0, innerWidth - rightWidth - minimumGap);
    if (leftWidth <= maximumWidth) return;
    leftText = truncateLeft
      ? truncateLeft(maximumWidth)
      : truncateToWidth(leftText, maximumWidth, "");
    leftWidth = visibleWidth(leftText);
  };

  const fitRight = () => {
    const maximumWidth = Math.max(0, innerWidth - leftWidth - minimumGap);
    if (rightWidth <= maximumWidth) return;
    rightText = truncateToWidth(rightText, maximumWidth, "");
    rightWidth = visibleWidth(rightText);
  };

  if (priority === "right") {
    fitLeft();
    minimumGap = leftWidth > 0 && rightWidth > 0 ? 1 : 0;
    fitRight();
  } else {
    fitRight();
    minimumGap = leftWidth > 0 && rightWidth > 0 ? 1 : 0;
    fitLeft();
  }

  const fillWidth = Math.max(0, innerWidth - leftWidth - rightWidth);
  return `${border(leftCorner)}${leftText}${border("─".repeat(fillWidth))}${rightText}${border(rightCorner)}`;
}

function frameLine(
  line: string,
  width: number,
  border: (text: string) => string,
  leftEdge = "│",
  rightEdge = "│",
): string {
  if (width <= 0) return "";
  if (width === 1) return border(leftEdge);

  const innerWidth = width - 2;
  const content =
    visibleWidth(line) > innerWidth
      ? truncateToWidth(line, innerWidth, "")
      : line;
  const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
  return `${border(leftEdge)}${content}${padding}${border(rightEdge)}`;
}

function panelLine(line: string, width: number, theme: FrameTheme): string {
  if (width <= 0) return "";
  const selectedBg = theme.getBgAnsi("selectedBg");
  const preserveBackground = (text: string) =>
    text.replace(
      ANSI_BACKGROUND_RESET_PATTERN,
      (reset) => `${reset}${selectedBg}`,
    );
  if (width === 1) {
    return theme.bg(
      "selectedBg",
      preserveBackground(truncateToWidth(line, width, "")),
    );
  }

  const contentWidth = width - 2;
  const content = truncateToWidth(line, contentWidth, "");
  const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(content)));
  return theme.bg("selectedBg", preserveBackground(` ${content}${padding} `));
}

export type EditorShellRows = {
  theme: FrameTheme;
  width: number;
  nativeLines: string[];
  showingAutocomplete: boolean;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  fitBottomLeft(width: number): string;
  /**
   * When true, keep the wrapped editor's own bottom-border line (framed with
   * side edges) instead of redrawing the shell's `╰─…─╯` bottom border. Used
   * to preserve a pi-vim live search prompt drawn on that border.
   */
  preserveBottomBorder?: boolean;
};

export function composeEditorShellRows(input: EditorShellRows): string[] {
  const {
    theme,
    width,
    nativeLines: renderedLines,
    showingAutocomplete,
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    fitBottomLeft,
    preserveBottomBorder = false,
  } = input;
  const border = (text: string) => theme.fg("border", text);
  const nativeWidth = Math.max(1, width - 2);
  const horizontalBorder = border("─").repeat(nativeWidth);
  const nativeLines = renderedLines.slice(1);
  let editorLines = nativeLines.slice(0, -1);
  let autocompleteLines: string[] = [];
  let preservedBottomBorder: string | undefined;

  if (showingAutocomplete) {
    const editorBottomIndex = nativeLines.findIndex(
      (line) =>
        line === horizontalBorder ||
        (line.includes("↓") &&
          line.includes(" more ") &&
          visibleWidth(line) === nativeWidth),
    );

    if (editorBottomIndex >= 0 && editorBottomIndex < nativeLines.length - 1) {
      editorLines = nativeLines.slice(0, editorBottomIndex);
      autocompleteLines = nativeLines.slice(editorBottomIndex + 1);
    }
  }

  // Preserve the wrapped editor's own bottom-border line (e.g. a live vim
  // search prompt) instead of redrawing the shell's bottom border. Only when
  // no autocomplete split consumed that border line.
  if (preserveBottomBorder && autocompleteLines.length === 0) {
    preservedBottomBorder = nativeLines[nativeLines.length - 1];
  }
  return [
    ...autocompleteLines.map((line) => panelLine(line, width, theme)),
    ...(autocompleteLines.length > 0 ? [""] : []),
    fitBorder(topLeft, topRight, width, border, "╭", "╮", "right"),
    ...editorLines.map((line) => frameLine(line, width, border)),
    preservedBottomBorder !== undefined
      ? frameLine(preservedBottomBorder, width, border)
      : fitBorder(
          bottomLeft,
          bottomRight,
          width,
          border,
          "╰",
          "╯",
          "left",
          fitBottomLeft,
        ),
  ];
}

/**
 * Marker stamped on the editor factory pi-tui-shell installs, so a later
 * `resources_discover` re-run (e.g. /reload, when no competing editor
 * re-registers first) can unwrap to the original inner instead of
 * double-framing. Module-scoped: the module loads once (jiti caches it), so the
 * Symbol's identity is stable across extension re-binds and `piTuiShell` calls.
 */
const FRAME_TAG = Symbol("pi-tui-shell-frame");
interface FrameTagPayload {
  inner: EditorFactory | undefined;
}
export default function piTuiShell(pi: ExtensionAPI): void {
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let activeTui: TUI | undefined;
  let activeModel: ModelInfo | undefined;
  let recentSessions: DashboardSession[] = [];
  let sessionsLoading = false;
  let sessionLoadGeneration = 0;
  let tuiSessionActive = false;
  const lifecycle = createLifecycleController(() => activeTui?.requestRender());

  // ── Editor frame ───────────────────────────────────────────────────────────
  // pi-tui-shell frames whichever editor is active: the native editor or a
  // custom one such as pi-vim's VimEditor. `renderEditorFrame` draws the shared
  // model/context/cwd/usage shell around any inner render output; the two
  // classes below are the factories' products (native vs. wrapped custom).

  /** Render the shell frame around `innerLines` (already at the inner width). */
  function renderEditorFrame(opts: {
    ctx: ExtensionContext;
    width: number;
    innerLines: string[];
    showingAutocomplete: boolean;
    modeLabel?: string;
    modeColor?: FrameColor;
    preserveBottomBorder?: boolean;
  }): string[] {
    const {
      ctx,
      width,
      innerLines,
      showingAutocomplete,
      modeLabel,
      modeColor,
      preserveBottomBorder,
    } = opts;
    const shellWidth = Math.max(1, width - 2);
    const theme = ctx.ui.theme;
    const thinking = pi.getThinkingLevel();
    const topLeft = editorTopLeftText(theme, activeModel);

    const context = formatContext(ctx, activeModel);
    const contextColor =
      context.percent !== null && context.percent > 90
        ? "error"
        : context.percent !== null && context.percent > 70
          ? "warning"
          : "text";
    const topRight = ` ${span(theme, "muted", "think ")}${thinkingLevelText(theme, thinking)}${separator(theme)}${span(theme, "muted", "ctx ")}${span(theme, contextColor, context.text)} `;

    const cwd = formatCwd(ctx.sessionManager.getCwd());
    const bottomLeft = editorBottomLeftText(theme, cwd, undefined, modeLabel, modeColor);
    const usage = computeSessionUsage(ctx);
    const elapsedMs =
      lifecycle.state !== "ready" && lifecycle.turnStartedAt !== undefined
        ? Date.now() - lifecycle.turnStartedAt
        : undefined;
    const bottomRight = editorBottomRightText(theme, usage, elapsedMs);

    return applyOuterMargin(
      composeEditorShellRows({
        theme,
        width: shellWidth,
        nativeLines: innerLines,
        showingAutocomplete,
        preserveBottomBorder,
        topLeft,
        topRight,
        bottomLeft,
        bottomRight,
        fitBottomLeft: (maximumWidth) =>
          editorBottomLeftText(theme, cwd, maximumWidth, modeLabel, modeColor),
      }),
      width,
    );
  }

  /** Native editor: today's framed editor, behavior unchanged. */
  class NativePiEditorFrame extends CustomEditor {
    private readonly frameCtx: ExtensionContext;

    constructor(
      tui: TUI,
      theme: EditorTheme,
      keybindings: KeybindingsManager,
      frameCtx: ExtensionContext,
    ) {
      super(tui, theme, keybindings, { paddingX: 0 });
      this.frameCtx = frameCtx;
      activeTui = tui;
    }

    override render(width: number): string[] {
      const shellWidth = Math.max(1, width - 2);
      const nativeWidth = Math.max(1, shellWidth - 2);
      this.borderColor = (text: string) =>
        this.frameCtx.ui.theme.fg("border", text);
      const lines = super.render(nativeWidth);
      if (lines.length < 2) return applyOuterMargin(lines, width);
      return renderEditorFrame({
        ctx: this.frameCtx,
        width,
        innerLines: lines,
        showingAutocomplete: this.isShowingAutocomplete(),
      });
    }
  }

  /**
   * Decorator around any inner editor (e.g. pi-vim's VimEditor). Forwards the
   * full editor surface so the TUI drives the inner editor directly, and
   * overrides only `render()` to frame it plus render the vim mode label
   * bottom-left. App keybindings reach the inner CustomEditor via the forwarded
   * `actionHandlers`/`on*` surface the TUI wires post-construction.
   */
  class FrameWrapper implements EditorComponent, Focusable {
    private readonly inner: EditorComponent;
    private readonly frameCtx: ExtensionContext;

    constructor(
      inner: EditorComponent,
      frameCtx: ExtensionContext,
      tui: TUI,
    ) {
      this.inner = inner;
      this.frameCtx = frameCtx;
      activeTui = tui;
      // Force padding 0 so the shell frame's border math lines up; do NOT expose
      // setPaddingX, so the TUI can't re-apply a settings padding afterward.
      this.inner.setPaddingX?.(0);
    }

    /**
     * Focusable surface, forwarded to the inner editor. The TUI focuses the
     * component it holds (this wrapper) and gates CURSOR_MARKER emission — and
     * thus hardware-cursor positioning, which pi-vim's insert-mode bar cursor
     * depends on — on `inner.focused`. Forwarding keeps the marker emitting so
     * pi-vim's cursor shape/position changes survive the wrap.
     */
    get focused(): boolean {
      return (this.inner as unknown as { focused: boolean }).focused;
    }
    set focused(value: boolean) {
      (this.inner as unknown as { focused: boolean }).focused = value;
    }
    render(width: number): string[] {
      const shellWidth = Math.max(1, width - 2);
      const nativeWidth = Math.max(1, shellWidth - 2);
      const border = (text: string) => this.frameCtx.ui.theme.fg("border", text);
      // Match the inner editor's borders to the shell frame (matters when we
      // preserve its bottom border, e.g. a live vim search prompt).
      this.borderColor = border;
      // Render hints (vim mode, native autocomplete visibility) live on the
      // *leaf* editor (e.g. VimEditor), not necessarily on the immediate
      // `inner` — a transparent wrapper (pi-history's HistoryEditor) between us
      // and the leaf hides them. Resolve the leaf; keep rendering via `inner`
      // so the wrapper's own overlays (e.g. pi-history search) are preserved.
      const leaf = leafEditor(this.inner);
      const mode = (leaf as { vimState?: { mode?: string } }).vimState?.mode;
      const innerLines = this.inner.render(nativeWidth);
      if (innerLines.length < 2) return applyOuterMargin(innerLines, width);
      return renderEditorFrame({
        ctx: this.frameCtx,
        width,
        innerLines,
        showingAutocomplete:
          (leaf as { isShowingAutocomplete?: () => boolean })
            .isShowingAutocomplete?.() ?? false,
        modeLabel: vimModeLabel(mode),
        modeColor: vimModeColor(mode),
        preserveBottomBorder: mode === "command-line",
      });
    }

    // ── EditorComponent surface, forwarded to the inner editor ───────────────
    invalidate(): void {
      this.inner.invalidate();
    }
    getText(): string {
      return this.inner.getText();
    }
    setText(text: string): void {
      this.inner.setText(text);
    }
    handleInput(data: string): void {
      this.inner.handleInput(data);
    }
    addToHistory(text: string): void {
      this.inner.addToHistory?.(text);
    }
    insertTextAtCursor(text: string): void {
      this.inner.insertTextAtCursor?.(text);
    }
    // Ghost-completion capability surface: pi-history's HistoryEditor only
    // enables ghost text when its wrapped editor exposes getLines/getCursor/
    // insertTextAtCursor (see missingGhostMethodReason). insertTextAtCursor is
    // already proxied above; expose the other two so the capability check
    // passes. EditorComponent doesn't declare them, so widen via a cast.
    getLines(): string[] {
      const fn = (this.inner as { getLines?(): string[] }).getLines;
      return fn ? fn.call(this.inner) : this.getText().split("\n");
    }
    getCursor(): { line: number; col: number } {
      const fn = (this.inner as {
        getCursor?(): { line: number; col: number };
      }).getCursor;
      if (fn) return fn.call(this.inner);
      const lines = this.getLines();
      const last = Math.max(0, lines.length - 1);
      return { line: last, col: lines[last]?.length ?? 0 };
    }
    getExpandedText(): string {
      return this.inner.getExpandedText?.() ?? this.inner.getText();
    }
    setAutocompleteProvider(provider: AutocompleteProvider): void {
      this.inner.setAutocompleteProvider?.(provider);
    }
    setAutocompleteMaxVisible(maxVisible: number): void {
      this.inner.setAutocompleteMaxVisible?.(maxVisible);
    }

    get borderColor() {
      return this.inner.borderColor;
    }
    set borderColor(value: ((str: string) => string) | undefined) {
      this.inner.borderColor = value;
    }

    get onSubmit() {
      return this.inner.onSubmit;
    }
    set onSubmit(value: ((text: string) => void) | undefined) {
      this.inner.onSubmit = value;
    }

    get onChange() {
      return this.inner.onChange;
    }
    set onChange(value: ((text: string) => void) | undefined) {
      this.inner.onChange = value;
    }

    // ── CustomEditor surface the TUI wires post-construction ─────────────────
    // actionHandlers + the on* handlers. Forwarded so app keybindings (Escape to
    // abort, Ctrl+D to exit, model cycling, paste-image, extension shortcuts)
    // reach the inner CustomEditor instead of dying on this wrapper.
    get actionHandlers() {
      return (this.inner as unknown as {
        actionHandlers: Map<string, () => void>;
      }).actionHandlers;
    }
    get onEscape() {
      return (this.inner as { onEscape?: () => void }).onEscape;
    }
    set onEscape(value: (() => void) | undefined) {
      (this.inner as { onEscape?: () => void }).onEscape = value;
    }
    get onCtrlD() {
      return (this.inner as { onCtrlD?: () => void }).onCtrlD;
    }
    set onCtrlD(value: (() => void) | undefined) {
      (this.inner as { onCtrlD?: () => void }).onCtrlD = value;
    }
    get onPasteImage() {
      return (this.inner as { onPasteImage?: () => void }).onPasteImage;
    }
    set onPasteImage(value: (() => void) | undefined) {
      (this.inner as { onPasteImage?: () => void }).onPasteImage = value;
    }
    get onExtensionShortcut() {
      return (this.inner as {
        onExtensionShortcut?: (data: string) => boolean;
      }).onExtensionShortcut;
    }
    set onExtensionShortcut(value: ((data: string) => boolean) | undefined) {
      (this.inner as {
        onExtensionShortcut?: (data: string) => boolean;
      }).onExtensionShortcut = value;
    }
  }

  pi.on("model_select", (event) => {
    activeModel = event.model;
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!tuiSessionActive) return;
    activeModel = ctx.model;
    lifecycle.start();
  });

  pi.on("agent_end", (_event, ctx) => {
    if (!tuiSessionActive) return;
    activeModel = ctx.model;
    lifecycle.end();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!tuiSessionActive) return;
    activeModel = ctx.model;
    lifecycle.settle();
  });

  pi.on("session_shutdown", () => {
    tuiSessionActive = false;
    sessionLoadGeneration += 1;
    activeTui = undefined;
    lifecycle.reset();
    activeModel = undefined;
    recentSessions = [];
    sessionsLoading = false;
  });

  pi.on("session_start", (_event, ctx) => {
    tuiSessionActive = ctx.mode === "tui";
    if (!tuiSessionActive) {
      sessionLoadGeneration += 1;
      activeTui = undefined;
      lifecycle.reset();
      activeModel = undefined;
      recentSessions = [];
      sessionsLoading = false;
      return;
    }

    // Frame every editor install at install time (closes the un-framed paint
    // window when a *replacing* editor like pi-vim registers AFTER our pre-frame
    // — see installEditorInstallInterceptor), then pre-frame the default editor
    // ahead of the first paint. resources_discover re-affirms both afterward.
    installEditorInstallInterceptor(ctx);
    installFramedEditor(ctx);
    activeTui = undefined;
    lifecycle.reset();
    activeModel = ctx.model;
    recentSessions = [];
    sessionsLoading = true;
    const loadGeneration = sessionLoadGeneration + 1;
    sessionLoadGeneration = loadGeneration;
    ctx.ui.setWorkingVisible(false);
    ctx.ui.setFooter((tui, theme, provider) => {
      activeTui = tui;
      return {
        render(width: number): string[] {
          return renderStatusFooter(
            theme,
            lifecycle.state,
            span(
              theme,
              "accent",
              spinnerFrames[lifecycle.spinnerIndex] ?? spinnerFrames[0],
            ),
            provider.getExtensionStatuses().values(),
            width,
          );
        },
        invalidate(): void {},
      } satisfies Component;
    });
    ctx.ui.setHeader((_tui, theme) =>
      createDashboardComponent(theme, () => ({
        version: VERSION,
        recentSessions,
        sessionsLoading,
      })),
    );
    const sessionDir = ctx.sessionManager.getSessionDir() || undefined;
    const currentSessionFile = ctx.sessionManager.getSessionFile();
    void SessionManager.list(ctx.sessionManager.getCwd(), sessionDir)
      .then((sessions) => {
        if (!tuiSessionActive || sessionLoadGeneration !== loadGeneration) {
          return;
        }
        recentSessions = recentDashboardSessions(sessions, currentSessionFile);
        sessionsLoading = false;
        activeTui?.requestRender();
      })
      .catch(() => {
        if (!tuiSessionActive || sessionLoadGeneration !== loadGeneration) {
          return;
        }
        recentSessions = [];
        sessionsLoading = false;
        activeTui?.requestRender();
      });

  });

  /**
   * Idempotently install the framed editor factory — wrapping whatever custom
   * editor is currently registered (e.g. pi-vim), else the native framed
   * editor. Called from BOTH `session_start` and `resources_discover`.
   *
   * Why both: pi paints the editor on a DEFERRED render (`process.nextTick` →
   * coalesced `setTimeout`), while `session_start` runs synchronously inside
   * `bindExtensions`'s microtask chain — ahead of that paint. Installing the
   * frame in `session_start` (not only in `resources_discover`) puts it in
   * place before the first paint on startup AND before the `renderBeforeBind`
   * paint on new sessions, so the un-framed default editor never flashes.
   *
   * `resources_discover` still re-runs it as the authoritative wrap: it fires
   * strictly after every extension's `session_start`, so even when a competing
   * editor (pi-vim) registers AFTER ours and overwrites our frame, it gets
   * wrapped here. The `FRAME_TAG` keeps both calls idempotent (no double-frame).
   */
  /**
   * Walk the `.inner` chain of an editor instance, returning true if any node
   * is one of our framing editors (`NativePiEditorFrame` / `FrameWrapper`).
   *
   * Another extension can install a *transparent* editor wrapper in its own
   * `session_start` (pi-history's `HistoryEditor` does this) that encloses the
   * editor we framed in ours. Such a wrapper hides our `FRAME_TAG` (the tag
   * lives on our factory, not its), so the idempotent unwrap in
   * `installFramedEditor` can't see it — and naively re-wrapping would stack a
   * second frame. This inspection lets us detect that case and pass the editor
   * through unchanged instead.
   */
  function chainHasOurFrame(editor: unknown): boolean {
    let node: unknown = editor;
    const seen = new Set<unknown>();
    while (node && typeof node === "object" && !seen.has(node)) {
      seen.add(node);
      if (node instanceof NativePiEditorFrame || node instanceof FrameWrapper) {
        return true;
      }
      node = (node as { inner?: unknown } | null)?.inner;
    }
    return false;
  }

  /**
   * Resolve the *leaf* editor at the bottom of a `.inner` wrapper chain.
   *
   * `FrameWrapper` renders the editor it holds and reads two render-time hints
   * — the vim mode label and native autocomplete visibility — that live on the
   * leaf editor (e.g. `VimEditor`). When a transparent wrapper such as
   * pi-history's `HistoryEditor` sits between us and the leaf, those hints are
   * invisible on the immediate `inner`: `HistoryEditor` has no `vimState`, and
   * its inherited `isShowingAutocomplete` reports its own (unused) CustomEditor
   * state rather than the leaf's. Walk to the leaf for those reads.
   */
  function leafEditor(editor: unknown): unknown {
    let node: unknown = editor;
    const seen = new Set<unknown>();
    while (node && typeof node === "object" && !seen.has(node)) {
      seen.add(node);
      const next = (node as { inner?: unknown } | null)?.inner;
      if (next === undefined) return node;
      node = next;
    }
    return node;
  }

  /**
   * Monkeypatch `ctx.ui.setEditorComponent` so every editor an extension
   * installs is framed at install time (via `FrameWrapper`, idempotent through
   * `chainHasOurFrame`).
   *
   * Why: an extension that *replaces* the editor in its own `session_start`
   * (pi-vim) registers an un-framed editor. That editor paints before
   * `resources_discover` re-frames it (resources_discover fires ~40ms after
   * that first un-framed paint) — a flash of the old editor. Framing at install
   * closes the window. It also makes the pi-vim layout match the native one:
   * pi-history ends up wrapping a *framed* editor (`HistoryEditor(Frame…)`),
   * exactly as it wraps the framed native editor when pi-vim is absent.
   *
   * `getEditorComponent` is left untouched, so pi-history still captures the
   * (now framed) factory and wraps it. Guarded so repeated `session_start`s
   * (new sessions) don't stack wrappers on the same `ctx.ui`.
   */
  function installEditorInstallInterceptor(ctx: ExtensionContext): void {
    type SetEditor = ((factory: EditorFactory | undefined) => void) & {
      __piTuiShellFramed?: boolean;
    };
    const ui = ctx.ui as { setEditorComponent: SetEditor };
    if (ui.setEditorComponent.__piTuiShellFramed) return;
    const orig = ui.setEditorComponent.bind(ui) as (
      factory: EditorFactory | undefined,
    ) => void;
    const frameFactory = (factory: EditorFactory | undefined) => {
      if (!factory) return factory;
      return (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
        const inner = factory(tui, theme, keybindings);
        if (chainHasOurFrame(inner)) return inner;
        return new FrameWrapper(inner, ctx, tui);
      };
    };
    const wrapped = ((factory: EditorFactory | undefined) =>
      orig(frameFactory(factory))) as SetEditor;
    Object.defineProperty(wrapped, "__piTuiShellFramed", { value: true });
    ui.setEditorComponent = wrapped;
  }

  function installFramedEditor(ctx: ExtensionContext): void {
    const current = ctx.ui.getEditorComponent() as
      | (EditorFactory & { [FRAME_TAG]?: FrameTagPayload })
      | undefined;
    // Idempotent re-wrap: if the live factory is one we tagged previously (e.g.
    // /reload, when no competing editor re-registers first), unwrap to its
    // inner before re-wrapping so we never frame an already-framed editor.
    const tag = current?.[FRAME_TAG];
    const base: EditorFactory | undefined = tag ? tag.inner : current;
    const factory: EditorFactory = (tui, theme, keybindings) => {
      if (!base) return new NativePiEditorFrame(tui, theme, keybindings, ctx);
      const inner = base(tui, theme, keybindings);
      // `base` is an untagged factory from another extension (e.g. pi-history's
      // HistoryEditor). It may already enclose the editor we framed in our
      // `session_start`; if so, re-wrapping it in a FrameWrapper would draw a
      // second border. Pass it through unchanged when our frame is already
      // present in the editor chain.
      if (chainHasOurFrame(inner)) return inner;
      return new FrameWrapper(inner, ctx, tui);
    };
    (factory as EditorFactory & { [FRAME_TAG]?: FrameTagPayload })[FRAME_TAG] = {
      inner: base,
    };
    ctx.ui.setEditorComponent(factory);
  }

  // Install the framed editor EARLY in `session_start` (ahead of the first
  // paint) so the un-framed default editor never flashes on startup / new
  // sessions, and re-affirm it in `resources_discover` (after every
  // `session_start`, so any editor that registered after ours is still wrapped).
  pi.on("resources_discover", (_event, ctx) => {
    if (!tuiSessionActive) return;
    installFramedEditor(ctx);
  });
}
