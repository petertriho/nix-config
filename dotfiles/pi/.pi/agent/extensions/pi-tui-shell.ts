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
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

export function editorBottomLeftText(
  theme: FrameTheme,
  cwd: string,
  width?: number,
): string {
  if (width === undefined) {
    return ` ${span(theme, "accent", cwd)} `;
  }
  if (width <= 0) return "";

  const horizontalPadding = width >= 2 ? 2 : 0;
  const contentWidth = width - horizontalPadding;
  const leftPadding = horizontalPadding > 0 ? " " : "";
  const rightPadding = leftPadding;
  return `${leftPadding}${span(theme, "accent", compactCwd(cwd, contentWidth))}${rightPadding}`;
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
  if (width <= 0) return ["", ""];

  const stateText =
    lifecycle === "ready"
      ? span(theme, "success", lifecycle)
      : `${spinnerFrame} ${span(theme, "accent", lifecycle)}`;
  const fittedState = truncateToWidth(stateText, width, "");
  const statusSeparator = separator(theme);
  const statusText = Array.from(statuses)
    .map(sanitizeStatusText)
    .filter((status) => visibleWidth(status) > 0)
    .join(statusSeparator);
  const statusBudget =
    width - visibleWidth(fittedState) - visibleWidth(statusSeparator);
  const fittedStatus =
    statusBudget > 0 ? truncateToWidth(statusText, statusBudget, "") : "";
  const suffix = fittedStatus ? `${statusSeparator}${fittedStatus}` : "";

  return [`${fittedState}${suffix}`, ""];
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
  } = input;
  const border = (text: string) => theme.fg("border", text);
  const nativeWidth = Math.max(1, width - 2);
  const horizontalBorder = border("─").repeat(nativeWidth);
  const nativeLines = renderedLines.slice(1);
  let editorLines = nativeLines.slice(0, -1);
  let autocompleteLines: string[] = [];

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

  return [
    ...autocompleteLines.map((line) => panelLine(line, width, theme)),
    ...(autocompleteLines.length > 0 ? [""] : []),
    fitBorder(topLeft, topRight, width, border, "╭", "╮", "right"),
    ...editorLines.map((line) => frameLine(line, width, border)),
    fitBorder(
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

export default function piTuiShell(pi: ExtensionAPI): void {
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let activeTui: TUI | undefined;
  let activeModel: ModelInfo | undefined;
  let recentSessions: DashboardSession[] = [];
  let sessionsLoading = false;
  let sessionLoadGeneration = 0;
  let tuiSessionActive = false;
  const lifecycle = createLifecycleController(() => activeTui?.requestRender());

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

    class PiEditorFrame extends CustomEditor {
      constructor(
        tui: TUI,
        theme: EditorTheme,
        keybindings: KeybindingsManager,
      ) {
        super(tui, theme, keybindings, { paddingX: 0 });
        activeTui = tui;
      }

      render(width: number): string[] {
        const shellWidth = Math.max(1, width - 2);
        const nativeWidth = Math.max(1, shellWidth - 2);
        const border = (text: string) => ctx.ui.theme.fg("border", text);
        this.borderColor = border;
        const lines = super.render(nativeWidth);
        if (lines.length < 2) return applyOuterMargin(lines, width);

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
        const bottomLeft = editorBottomLeftText(theme, cwd);
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
            nativeLines: lines,
            showingAutocomplete: this.isShowingAutocomplete(),
            topLeft,
            topRight,
            bottomLeft,
            bottomRight,
            fitBottomLeft: (maximumWidth) =>
              editorBottomLeftText(theme, cwd, maximumWidth),
          }),
          width,
        );
      }
    }

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new PiEditorFrame(tui, theme, keybindings),
    );
  });
}
