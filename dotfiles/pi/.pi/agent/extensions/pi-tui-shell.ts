import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteProvider,
  Component,
  EditorComponent,
  EditorTheme,
  Focusable,
  TUI,
} from "@earendil-works/pi-tui";
import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

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

export type SessionAccounting = {
  usage: SessionUsage;
  context: ContextDisplay;
};

export type SessionAccountingCache = {
  read(ctx: ExtensionContext, model: ModelInfo | undefined): SessionAccounting;
  invalidate(): void;
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

export type ActivityPhase = "thinking" | "responding" | "settling";

export type ActiveTool = {
  toolCallId: string;
  toolName: string;
  order: number;
};

export type ActivitySnapshot = {
  phase: ActivityPhase | undefined;
  turn: number | undefined;
  currentTool: ActiveTool | undefined;
  activeToolCount: number;
};

export type ActivityTracker = {
  readonly snapshot: ActivitySnapshot;
  startTurn(turnIndex: number): void;
  setPhase(phase: ActivityPhase): void;
  startTool(toolCallId: string, toolName: string): void;
  endTool(toolCallId: string): void;
  settle(): void;
  reset(): void;
};

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

export function createActivityTracker(onChange: () => void): ActivityTracker {
  let phase: ActivityPhase | undefined;
  let turn: number | undefined;
  let toolOrder = 0;
  const activeTools = new Map<string, ActiveTool>();

  const currentTool = (): ActiveTool | undefined => {
    let current: ActiveTool | undefined;
    for (const tool of activeTools.values()) {
      if (!current || tool.order > current.order) current = tool;
    }
    return current;
  };

  return {
    get snapshot() {
      const tool = currentTool();
      return {
        phase,
        turn,
        currentTool: tool ? { ...tool } : undefined,
        activeToolCount: activeTools.size,
      };
    },
    startTurn(turnIndex: number) {
      const nextTurn = Math.max(1, Math.floor(turnIndex) + 1);
      const changed = turn !== nextTurn || phase !== "thinking";
      turn = nextTurn;
      phase = "thinking";
      if (changed) onChange();
    },
    setPhase(nextPhase: ActivityPhase) {
      if (phase === nextPhase) return;
      phase = nextPhase;
      onChange();
    },
    startTool(toolCallId: string, toolName: string) {
      toolOrder += 1;
      activeTools.set(toolCallId, { toolCallId, toolName, order: toolOrder });
      onChange();
    },
    endTool(toolCallId: string) {
      if (!activeTools.delete(toolCallId)) return;
      onChange();
    },
    settle() {
      const changed = phase !== "settling" || activeTools.size > 0;
      phase = "settling";
      activeTools.clear();
      if (changed) onChange();
    },
    reset() {
      const changed =
        phase !== undefined || turn !== undefined || activeTools.size > 0;
      phase = undefined;
      turn = undefined;
      toolOrder = 0;
      activeTools.clear();
      if (changed) onChange();
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

export function span(
  theme: FrameTheme,
  color: FrameColor,
  text: string,
): string {
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
  thinking: ThinkingLevel,
  width?: number,
): string {
  const thinkText = `${span(theme, "muted", "think ")}${thinkingLevelText(theme, thinking)}`;
  const identity = model
    ? `${span(theme, "accent", sanitizePlainTerminalText(model.provider))}${span(
        theme,
        "dim",
        "/",
      )}${span(theme, "text", sanitizePlainTerminalText(model.id))}`
    : span(theme, "muted", "no model");

  // Unconstrained: full model identity followed by the thinking level.
  if (width === undefined) {
    return ` ${identity}${separator(theme)}${thinkText} `;
  }
  if (width <= 0) return "";

  // Constrained: preserve `think`; compact the identity (drop the provider,
  // then truncate the id) first — mirrors fitBottomLeft's mode-label logic.
  const horizontalPadding = width >= 2 ? 2 : 0;
  const contentWidth = width - horizontalPadding;
  const leftPadding = horizontalPadding > 0 ? " " : "";
  const rightPadding = leftPadding;
  const sep = separator(theme);
  const sepWidth = visibleWidth(sep);
  const thinkWidth = visibleWidth(thinkText);

  if (contentWidth <= thinkWidth) {
    return `${leftPadding}${truncateToWidth(thinkText, contentWidth, "")}${rightPadding}`;
  }

  const identityBudget = contentWidth - thinkWidth - sepWidth;
  if (identityBudget <= 0) {
    return `${leftPadding}${thinkText}${rightPadding}`;
  }
  const idOnly = model
    ? span(theme, "text", sanitizePlainTerminalText(model.id))
    : identity;
  const fitIdentity = (budget: number): string => {
    if (visibleWidth(identity) <= budget) return identity;
    if (visibleWidth(idOnly) <= budget) return idOnly;
    return truncateToWidth(idOnly, budget, "");
  };
  return `${leftPadding}${fitIdentity(identityBudget)}${sep}${thinkText}${rightPadding}`;
}

const CONTEXT_METER_SEGMENTS = 5;

export function contextMeterFill(
  percent: number | null,
  segments = CONTEXT_METER_SEGMENTS,
): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  const segmentCount = Math.max(0, Math.floor(segments));
  const normalized = Math.max(0, Math.min(100, percent));
  return Math.round((normalized / 100) * segmentCount);
}

function contextColor(percent: number | null): FrameColor {
  if (percent === null) return "muted";
  if (percent > 90) return "error";
  if (percent > 70) return "warning";
  return "accent";
}

export function contextMeterText(
  theme: FrameTheme,
  context: ContextDisplay,
  segments = CONTEXT_METER_SEGMENTS,
): string {
  const segmentCount = Math.max(0, Math.floor(segments));
  const filled = contextMeterFill(context.percent, segmentCount);
  if (filled === null) return span(theme, "dim", "░".repeat(segmentCount));
  const empty = segmentCount - filled;
  const filledText =
    filled > 0
      ? span(theme, contextColor(context.percent), "█".repeat(filled))
      : "";
  const emptyText = empty > 0 ? span(theme, "dim", "░".repeat(empty)) : "";
  return `${filledText}${emptyText}`;
}

function editorTopRightContent(
  theme: FrameTheme,
  context: ContextDisplay,
  cost: number,
  options: { showCost: boolean; showLabel: boolean; showMeter: boolean },
): string {
  const contextParts: string[] = [];
  if (options.showLabel) contextParts.push(span(theme, "muted", "ctx"));
  if (options.showMeter) contextParts.push(contextMeterText(theme, context));
  contextParts.push(span(theme, contextColor(context.percent), context.text));
  const contextText = contextParts.join(" ");
  // Hide zero-cost sessions (e.g. local/offline models) instead of showing $0.000.
  if (!options.showCost || cost <= 0) return contextText;
  const costText = `${span(theme, "muted", "$")}${span(
    theme,
    "text",
    cost.toFixed(3),
  )}`;
  return `${costText}${separator(theme)}${contextText}`;
}

function fitEditorTopRightText(
  theme: FrameTheme,
  context: ContextDisplay,
  cost: number,
  width: number,
): string {
  if (width <= 0) return "";

  const horizontalPadding = width >= 2 ? 2 : 0;
  const contentWidth = width - horizontalPadding;
  const padding = horizontalPadding > 0 ? " " : "";
  const candidates = [
    editorTopRightContent(theme, context, cost, {
      showCost: true,
      showLabel: true,
      showMeter: true,
    }),
    editorTopRightContent(theme, context, cost, {
      showCost: false,
      showLabel: true,
      showMeter: true,
    }),
    editorTopRightContent(theme, context, cost, {
      showCost: false,
      showLabel: true,
      showMeter: false,
    }),
    editorTopRightContent(theme, context, cost, {
      showCost: false,
      showLabel: false,
      showMeter: false,
    }),
  ];
  const fitted = candidates.find(
    (candidate) => visibleWidth(candidate) <= contentWidth,
  );
  if (fitted !== undefined) return `${padding}${fitted}${padding}`;

  const absolute = span(
    theme,
    contextColor(context.percent),
    truncateToWidth(context.text, contentWidth, ""),
  );
  return `${padding}${absolute}${padding}`;
}

export function editorTopRightText(
  theme: FrameTheme,
  context: ContextDisplay,
  cost: number,
  width?: number,
): string {
  if (width !== undefined) {
    return fitEditorTopRightText(theme, context, cost, width);
  }
  return ` ${editorTopRightContent(theme, context, cost, {
    showCost: true,
    showLabel: true,
    showMeter: true,
  })} `;
}

export type EditorTurnInfo = {
  state: LifecycleState;
  spinnerFrame: string;
  elapsedMs?: number;
  activity?: ActivitySnapshot;
};

export type EditorBottomRightInput = {
  usage: SessionUsage;
  turn: EditorTurnInfo;
  width?: number;
};

function sessionUsageStatsText(
  theme: FrameTheme,
  usage: SessionUsage,
  includeCache = true,
): string {
  const statSpecs = [
    { label: "↑", value: usage.input, color: "accent", cache: false },
    { label: "↓", value: usage.output, color: "success", cache: false },
    { label: "R", value: usage.cacheRead, color: "muted", cache: true },
    { label: "W", value: usage.cacheWrite, color: "muted", cache: true },
  ] satisfies Array<{
    label: string;
    value: number;
    color: FrameColor;
    cache: boolean;
  }>;
  const stats: string[] = [];
  for (const stat of statSpecs) {
    if (stat.value <= 0 || (!includeCache && stat.cache)) continue;
    stats.push(
      `${span(theme, stat.color, stat.label)}${span(theme, "text", formatTokens(stat.value))}`,
    );
  }
  return stats.join(separator(theme, " "));
}

function activityIndicatorText(
  theme: FrameTheme,
  turn: EditorTurnInfo,
  options: { showCount: boolean; showTurn: boolean; showElapsed: boolean },
): string {
  if (turn.state === "ready") return "";

  const snapshot = turn.activity;
  const currentTool = snapshot?.currentTool;
  const sanitizedTool = currentTool
    ? sanitizePlainTerminalText(currentTool.toolName)
    : "";
  const phase =
    snapshot?.phase ?? (turn.state === "settling" ? "settling" : "thinking");
  const label = sanitizedTool || (currentTool ? "tool" : phase);
  const additionalTools = Math.max(0, (snapshot?.activeToolCount ?? 0) - 1);
  const countText =
    options.showCount && additionalTools > 0
      ? span(theme, "muted", ` +${additionalTools}`)
      : "";
  const primary = `${span(theme, "accent", turn.spinnerFrame)} ${span(
    theme,
    "accent",
    label,
  )}${countText}`;
  const details: string[] = [];
  if (options.showTurn && snapshot?.turn !== undefined) {
    details.push(span(theme, "muted", `t${snapshot.turn}`));
  }
  if (options.showElapsed && turn.elapsedMs !== undefined) {
    details.push(span(theme, "text", formatDuration(turn.elapsedMs)));
  }
  return [primary, ...details].join(separator(theme));
}

function joinBorderParts(theme: FrameTheme, parts: string[]): string {
  const visibleParts = parts.filter((part) => visibleWidth(part) > 0);
  if (visibleParts.length === 0) return "";
  return ` ${visibleParts.join(separator(theme))} `;
}

function fitEditorBottomRightText(
  theme: FrameTheme,
  usage: SessionUsage,
  turn: EditorTurnInfo,
  width: number,
): string {
  if (width <= 0) return "";

  const horizontalPadding = width >= 2 ? 2 : 0;
  const contentWidth = width - horizontalPadding;
  const padding = horizontalPadding > 0 ? " " : "";
  const stats = sessionUsageStatsText(theme, usage);
  const ioStats = sessionUsageStatsText(theme, usage, false);
  const activity = (options: {
    showCount: boolean;
    showTurn: boolean;
    showElapsed: boolean;
  }) => activityIndicatorText(theme, turn, options);
  const combine = (statsText: string, activityText: string) => {
    if (!statsText) return activityText;
    if (!activityText) return statsText;
    return `${statsText}${separator(theme)}${activityText}`;
  };

  const fullActivity = activity({
    showCount: true,
    showTurn: true,
    showElapsed: true,
  });
  const noCountActivity = activity({
    showCount: false,
    showTurn: true,
    showElapsed: true,
  });
  const compactActivity = activity({
    showCount: false,
    showTurn: false,
    showElapsed: true,
  });
  const baseActivity = activity({
    showCount: false,
    showTurn: false,
    showElapsed: false,
  });
  const candidates =
    turn.state === "ready"
      ? [stats, ioStats]
      : [
          combine(stats, fullActivity),
          combine(ioStats, fullActivity),
          combine(ioStats, noCountActivity),
          combine(ioStats, compactActivity),
          compactActivity,
          baseActivity,
        ];
  const fitted = candidates.find(
    (candidate) => visibleWidth(candidate) <= contentWidth,
  );
  if (fitted !== undefined) {
    return fitted === "" ? "" : `${padding}${fitted}${padding}`;
  }

  const fallback = turn.state === "ready" ? ioStats || stats : baseActivity;
  if (!fallback) return "";
  return `${padding}${truncateToWidth(fallback, contentWidth, "")}${padding}`;
}

export function editorBottomRightText(
  theme: FrameTheme,
  input: EditorBottomRightInput,
): string {
  if (input.width !== undefined) {
    return fitEditorBottomRightText(
      theme,
      input.usage,
      input.turn,
      input.width,
    );
  }
  const stats = sessionUsageStatsText(theme, input.usage);
  const activity = activityIndicatorText(theme, input.turn, {
    showCount: true,
    showTurn: true,
    showElapsed: true,
  });
  return joinBorderParts(theme, [stats, activity]);
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: Removes terminal control bytes from untrusted display text.
const TERMINAL_CONTROL_PATTERN = /[\x00-\x1f\x7f]/g;

/** Strip terminal controls from untrusted text while keeping printable content. */
export function sanitizePlainTerminalText(text: string): string {
  return stripTerminalSequences(text)
    .replace(TERMINAL_CONTROL_PATTERN, " ")
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
  statuses: Iterable<string>,
  width: number,
): string[] {
  if (width <= 0) return [];

  const statusText = Array.from(statuses)
    .filter((status) => visibleWidth(status) > 0)
    .join(separator(theme));
  if (visibleWidth(statusText) === 0) return [];
  return [truncateToWidth(statusText, width, "")];
}

export function renderStatusFooter(
  theme: ShellTheme,
  statuses: Iterable<string>,
  width: number,
): string[] {
  const contentWidth = Math.max(0, width - 2);
  return applyOuterMargin(
    renderStatusFooterContent(theme, statuses, contentWidth),
    width,
  );
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
  if (!usage || usage.tokens === null) {
    return { text: `?/${limit}`, percent: null };
  }

  return {
    text: `${formatTokens(usage.tokens)}/${limit}`,
    percent: usage.percent,
  };
}

export function createSessionAccountingCache(): SessionAccountingCache {
  let cached: SessionAccounting | undefined;

  return {
    read(
      ctx: ExtensionContext,
      model: ModelInfo | undefined,
    ): SessionAccounting {
      cached ??= {
        usage: computeSessionUsage(ctx),
        context: formatContext(ctx, model),
      };
      return cached;
    },
    invalidate(): void {
      cached = undefined;
    },
  };
}

type FitBorderInput = {
  left: string;
  right: string;
  width: number;
  border: (text: string) => string;
  leftCorner: string;
  rightCorner: string;
  priority: BorderPriority;
  truncateLeft?: (width: number) => string;
  truncateRight?: (width: number) => string;
};

function fitBorder(input: FitBorderInput): string {
  const {
    left,
    right,
    width,
    border,
    leftCorner,
    rightCorner,
    priority,
    truncateLeft,
    truncateRight,
  } = input;
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
    rightText = truncateRight
      ? truncateRight(maximumWidth)
      : truncateToWidth(rightText, maximumWidth, "");
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

function isEditorBorderLine(
  line: string | undefined,
  horizontalBorder: string,
  scrollDirection: "↑" | "↓",
  width: number,
): boolean {
  return (
    line === horizontalBorder ||
    (line?.includes(scrollDirection) === true &&
      line.includes(" more ") &&
      visibleWidth(line) === width)
  );
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
  /** Constrained top-left fit: preserve `think`, compact the model identity. */
  fitTopLeft?(width: number): string;
  /** Constrained top-right fit: preserve context, remove cost first. */
  fitTopRight?(width: number): string;
  /** Constrained bottom-right fit: preserve activity, then I/O, then cache. */
  fitBottomRight?(width: number): string;
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
    fitTopLeft,
    fitTopRight,
    fitBottomRight,
    preserveBottomBorder = false,
  } = input;
  const border = (text: string) => theme.fg("border", text);
  const nativeWidth = Math.max(1, width - 2);
  const horizontalBorder = border("─").repeat(nativeWidth);
  const hasNativeBorders =
    renderedLines.length >= 2 &&
    isEditorBorderLine(renderedLines[0], horizontalBorder, "↑", nativeWidth);
  const nativeLines = hasNativeBorders ? renderedLines.slice(1) : renderedLines;
  let editorLines = hasNativeBorders ? nativeLines.slice(0, -1) : nativeLines;
  let autocompleteLines: string[] = [];
  let preservedBottomBorder: string | undefined;

  if (showingAutocomplete && hasNativeBorders) {
    const editorBottomIndex = nativeLines.findIndex((line) =>
      isEditorBorderLine(line, horizontalBorder, "↓", nativeWidth),
    );

    if (editorBottomIndex >= 0 && editorBottomIndex < nativeLines.length - 1) {
      editorLines = nativeLines.slice(0, editorBottomIndex);
      autocompleteLines = nativeLines.slice(editorBottomIndex + 1);
    }
  }

  // Preserve the wrapped editor's own bottom-border line (e.g. a live vim
  // search prompt) instead of redrawing the shell's bottom border. Only when
  // no autocomplete split consumed that border line.
  if (
    hasNativeBorders &&
    preserveBottomBorder &&
    autocompleteLines.length === 0
  ) {
    preservedBottomBorder = nativeLines.at(-1);
  }
  return [
    ...autocompleteLines.map((line) => panelLine(line, width, theme)),
    ...(autocompleteLines.length > 0 ? [""] : []),
    fitBorder({
      left: topLeft,
      right: topRight,
      width,
      border,
      leftCorner: "╭",
      rightCorner: "╮",
      priority: "right",
      truncateLeft: fitTopLeft,
      truncateRight: fitTopRight,
    }),
    ...editorLines.map((line) => frameLine(line, width, border)),
    preservedBottomBorder === undefined
      ? fitBorder({
          left: bottomLeft,
          right: bottomRight,
          width,
          border,
          leftCorner: "╰",
          rightCorner: "╯",
          priority: "left",
          truncateLeft: fitBottomLeft,
          truncateRight: fitBottomRight,
        })
      : frameLine(preservedBottomBorder, width, border),
  ];
}

/**
 * Global symbols survive jiti hot reloads, unlike module-local Symbol() values.
 * The frame tag exposes the logical inner factory; the interceptor tag retains
 * the original UI setter so a new extension generation can recover safely.
 */
const FRAME_TAG = Symbol.for("pi-tui-shell-frame");
const EDITOR_INTERCEPTOR_TAG = Symbol.for("pi-tui-shell-editor-interceptor");

type SetEditor = (factory: EditorFactory | undefined) => void;
type TaggedEditorFactory = EditorFactory & { [FRAME_TAG]?: FrameTagPayload };
type InterceptedSetEditor = SetEditor & {
  [EDITOR_INTERCEPTOR_TAG]?: EditorInterceptorPayload;
};

interface FrameTagPayload {
  inner: EditorFactory | undefined;
}

interface EditorInterceptorPayload {
  original: SetEditor;
}

export default function piTuiShell(pi: ExtensionAPI): void {
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let activeTui: TUI | undefined;
  let activeModel: ModelInfo | undefined;
  let tuiSessionActive = false;
  let restoreEditorInstallInterceptor: (() => void) | undefined;
  const lifecycle = createLifecycleController(() => activeTui?.requestRender());
  const activity = createActivityTracker(() => activeTui?.requestRender());
  const accounting = createSessionAccountingCache();

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
    const topLeft = editorTopLeftText(theme, activeModel, thinking);

    const { context, usage } = accounting.read(ctx, activeModel);
    const minimumTopLeftWidth = visibleWidth(` think ${thinking} `);
    const topRightBudget = Math.max(0, shellWidth - 3 - minimumTopLeftWidth);
    const topRight = editorTopRightText(
      theme,
      context,
      usage.cost,
      topRightBudget,
    );

    const cwd = sanitizePlainTerminalText(
      formatCwd(ctx.sessionManager.getCwd()),
    );
    const bottomLeft = editorBottomLeftText(
      theme,
      cwd,
      undefined,
      modeLabel,
      modeColor,
    );
    const elapsedMs =
      lifecycle.state !== "ready" && lifecycle.turnStartedAt !== undefined
        ? Date.now() - lifecycle.turnStartedAt
        : undefined;
    const turn: EditorTurnInfo = {
      state: lifecycle.state,
      spinnerFrame: spinnerFrames[lifecycle.spinnerIndex] ?? spinnerFrames[0],
      elapsedMs,
      activity: activity.snapshot,
    };
    const bottomRight = editorBottomRightText(theme, { usage, turn });

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
        fitTopLeft: (maximumWidth) =>
          editorTopLeftText(theme, activeModel, thinking, maximumWidth),
        fitTopRight: (maximumWidth) =>
          editorTopRightText(theme, context, usage.cost, maximumWidth),
        fitBottomRight: (maximumWidth) =>
          editorBottomRightText(theme, { usage, turn, width: maximumWidth }),
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

    constructor(inner: EditorComponent, frameCtx: ExtensionContext, tui: TUI) {
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
    get wantsKeyRelease(): boolean | undefined {
      return this.inner.wantsKeyRelease;
    }
    set wantsKeyRelease(value: boolean | undefined) {
      this.inner.wantsKeyRelease = value;
    }
    render(width: number): string[] {
      const shellWidth = Math.max(1, width - 2);
      const nativeWidth = Math.max(1, shellWidth - 2);
      const border = (text: string) =>
        this.frameCtx.ui.theme.fg("border", text);
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
          (
            leaf as { isShowingAutocomplete?: () => boolean }
          ).isShowingAutocomplete?.() ?? false,
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
      const fn = (
        this.inner as {
          getCursor?(): { line: number; col: number };
        }
      ).getCursor;
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
      return (
        this.inner as unknown as {
          actionHandlers: Map<string, () => void>;
        }
      ).actionHandlers;
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
      return (
        this.inner as {
          onExtensionShortcut?: (data: string) => boolean;
        }
      ).onExtensionShortcut;
    }
    set onExtensionShortcut(value: ((data: string) => boolean) | undefined) {
      (
        this.inner as {
          onExtensionShortcut?: (data: string) => boolean;
        }
      ).onExtensionShortcut = value;
    }
  }

  pi.on("model_select", (event) => {
    activeModel = event.model;
    accounting.invalidate();
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });

  pi.on("turn_start", (event) => {
    if (!tuiSessionActive) return;
    activity.startTurn(event.turnIndex);
  });

  pi.on("message_start", (event) => {
    if (!tuiSessionActive || event.message.role !== "assistant") return;
    activity.setPhase("responding");
  });

  pi.on("message_update", (event) => {
    if (!tuiSessionActive || event.message.role !== "assistant") return;
    activity.setPhase("responding");
  });

  pi.on("tool_execution_start", (event) => {
    if (!tuiSessionActive) return;
    activity.startTool(event.toolCallId, event.toolName);
  });

  pi.on("tool_execution_end", (event) => {
    if (!tuiSessionActive) return;
    activity.endTool(event.toolCallId);
  });

  pi.on("message_end", () => {
    accounting.invalidate();
  });

  pi.on("turn_end", () => {
    accounting.invalidate();
  });

  pi.on("session_compact", () => {
    accounting.invalidate();
  });

  pi.on("session_tree", () => {
    accounting.invalidate();
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!tuiSessionActive) return;
    activeModel = ctx.model;
    activity.setPhase("thinking");
    lifecycle.start();
  });

  pi.on("agent_end", (_event, ctx) => {
    if (!tuiSessionActive) return;
    activeModel = ctx.model;
    accounting.invalidate();
    activity.settle();
    lifecycle.end();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!tuiSessionActive) return;
    activeModel = ctx.model;
    activity.reset();
    lifecycle.settle();
  });

  pi.on("session_shutdown", () => {
    restoreEditorInstallInterceptor?.();
    tuiSessionActive = false;
    activeTui = undefined;
    lifecycle.reset();
    activity.reset();
    accounting.invalidate();
    activeModel = undefined;
  });

  pi.on("session_start", (_event, ctx) => {
    accounting.invalidate();
    tuiSessionActive = ctx.mode === "tui";
    if (!tuiSessionActive) {
      restoreEditorInstallInterceptor?.();
      activeTui = undefined;
      lifecycle.reset();
      activity.reset();
      activeModel = undefined;
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
    activity.reset();
    activeModel = ctx.model;
    ctx.ui.setWorkingVisible(false);
    ctx.ui.setFooter((tui, theme, provider) => {
      activeTui = tui;
      return {
        render(width: number): string[] {
          return renderStatusFooter(
            theme,
            provider.getExtensionStatuses().values(),
            width,
          );
        },
        invalidate(): void {},
      } satisfies Component;
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
  function createFramedEditorFactory(
    candidate: EditorFactory | undefined,
    ctx: ExtensionContext,
  ): TaggedEditorFactory {
    const base =
      (candidate as TaggedEditorFactory | undefined)?.[FRAME_TAG]?.inner ??
      candidate;
    const factory: TaggedEditorFactory = (tui, theme, keybindings) => {
      if (!base) return new NativePiEditorFrame(tui, theme, keybindings, ctx);
      const inner = base(tui, theme, keybindings);
      if (chainHasOurFrame(inner)) return inner;
      return new FrameWrapper(inner, ctx, tui);
    };
    factory[FRAME_TAG] = { inner: base };
    return factory;
  }

  function installEditorInstallInterceptor(ctx: ExtensionContext): void {
    restoreEditorInstallInterceptor?.();

    const ui = ctx.ui as { setEditorComponent: InterceptedSetEditor };
    const currentSetter = ui.setEditorComponent;
    const previousInterceptor = currentSetter[EDITOR_INTERCEPTOR_TAG];
    const original = previousInterceptor?.original ?? currentSetter;
    const wrapped = ((factory: EditorFactory | undefined) => {
      original(createFramedEditorFactory(factory, ctx));
    }) as InterceptedSetEditor;
    wrapped[EDITOR_INTERCEPTOR_TAG] = { original };
    ui.setEditorComponent = wrapped;

    restoreEditorInstallInterceptor = () => {
      if (ui.setEditorComponent === wrapped) {
        ui.setEditorComponent = original as InterceptedSetEditor;
      }
      restoreEditorInstallInterceptor = undefined;
    };
  }

  function installFramedEditor(ctx: ExtensionContext): void {
    const current = ctx.ui.getEditorComponent() as
      | TaggedEditorFactory
      | undefined;
    ctx.ui.setEditorComponent(current?.[FRAME_TAG]?.inner ?? current);
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
