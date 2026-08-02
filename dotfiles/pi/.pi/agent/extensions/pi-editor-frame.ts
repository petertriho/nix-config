import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ModelInfo = {
  provider: string;
  id: string;
  contextWindow: number;
};

type ContextDisplay = {
  text: string;
  percent: number | null;
};

type SessionUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

type FrameTheme = ExtensionContext["ui"]["theme"];
type FrameColor = Parameters<FrameTheme["fg"]>[0];
type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type BorderPriority = "left" | "right";

// biome-ignore lint/suspicious/noControlCharactersInRegex: Matches ANSI SGR resets in rendered TUI lines.
const ANSI_BACKGROUND_RESET_PATTERN = /\x1b\[(?:0|49)?m/g;

function formatTokens(count: number): string {
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

function bottomLeftText(
  theme: FrameTheme,
  cwd: string,
  statuses: string[],
  width?: number,
): string {
  const statusSeparator = separator(theme);
  const statusText = statuses.join(statusSeparator);

  if (width === undefined) {
    const suffix = statusText ? `${statusSeparator}${statusText}` : "";
    return ` ${span(theme, "accent", cwd)}${suffix} `;
  }
  if (width <= 0) return "";

  const horizontalPadding = width >= 2 ? 2 : 0;
  const contentWidth = width - horizontalPadding;
  const leftPadding = horizontalPadding > 0 ? " " : "";
  const rightPadding = leftPadding;

  if (!statusText || contentWidth <= visibleWidth(statusSeparator) + 1) {
    return `${leftPadding}${span(theme, "accent", compactCwd(cwd, contentWidth))}${rightPadding}`;
  }

  const separatorWidth = visibleWidth(statusSeparator);
  const statusWidth = visibleWidth(statusText);
  const cwdWidth = Math.max(1, contentWidth - separatorWidth - statusWidth);
  const compactedCwd = compactCwd(cwd, cwdWidth);
  const statusBudget = Math.max(
    0,
    contentWidth - visibleWidth(compactedCwd) - separatorWidth,
  );
  const compactedStatus = truncateToWidth(statusText, statusBudget, "");
  const suffix = compactedStatus ? `${statusSeparator}${compactedStatus}` : "";

  return `${leftPadding}${span(theme, "accent", compactedCwd)}${suffix}${rightPadding}`;
}

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
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

class EmptyFooter implements Component {
  render(): string[] {
    return [];
  }

  invalidate(): void {}
}

export default function piEditorFrame(pi: ExtensionAPI): void {
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let isWorking = false;
  let spinnerIndex = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | undefined;
  let activeTui: TUI | undefined;
  let footerData: ReadonlyFooterDataProvider | undefined;
  let activeModel: ModelInfo | undefined;
  let turnStartedAt: number | undefined;

  // Pi does not reliably dispose replaced custom editors, so the timer belongs
  // to the extension lifecycle instead of an editor instance.
  const stopSpinner = () => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = undefined;
    }
  };

  const startSpinner = () => {
    if (spinnerTimer || !activeTui) return;

    spinnerIndex = 0;
    spinnerTimer = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      activeTui?.requestRender();
    }, 80);
  };

  pi.on("model_select", (event) => {
    activeModel = event.model;
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });

  pi.on("agent_start", (_event, ctx) => {
    activeModel = ctx.model;
    isWorking = true;
    turnStartedAt = Date.now();
    startSpinner();
    activeTui?.requestRender();
  });

  pi.on("agent_end", (_event, ctx) => {
    activeModel = ctx.model;
    isWorking = false;
    turnStartedAt = undefined;
    stopSpinner();
    activeTui?.requestRender();
  });

  pi.on("session_shutdown", () => {
    isWorking = false;
    stopSpinner();
    activeTui = undefined;
    footerData = undefined;
    activeModel = undefined;
    turnStartedAt = undefined;
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    isWorking = false;
    turnStartedAt = undefined;
    stopSpinner();
    activeModel = ctx.model;
    ctx.ui.setWorkingVisible(false);
    ctx.ui.setFooter((_tui, _theme, provider) => {
      footerData = provider;
      return new EmptyFooter();
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
        const innerWidth = Math.max(1, width - 2);
        const border = (text: string) => ctx.ui.theme.fg("border", text);
        this.borderColor = border;
        const lines = super.render(innerWidth);
        if (lines.length < 2) return lines;

        const theme = ctx.ui.theme;
        const thinking = pi.getThinkingLevel();
        const spinner = isWorking
          ? `${theme.fg("accent", spinnerFrames[spinnerIndex])} `
          : "";
        const model = activeModel
          ? `${span(theme, "accent", activeModel.provider)}${span(theme, "dim", "/")}${span(theme, "text", activeModel.id)}`
          : span(theme, "muted", "no model");
        const topLeft = ` ${spinner}${model} `;

        const context = formatContext(ctx, activeModel);
        const contextColor =
          context.percent !== null && context.percent > 90
            ? "error"
            : context.percent !== null && context.percent > 70
              ? "warning"
              : "text";
        const topRight = ` ${span(theme, "muted", "think ")}${thinkingLevelText(theme, thinking)}${separator(theme)}${span(theme, "muted", "ctx ")}${span(theme, contextColor, context.text)} `;

        const statuses = Array.from(
          footerData?.getExtensionStatuses().values() ?? [],
        )
          .map(sanitizeStatusText)
          .filter((status) => visibleWidth(status) > 0);
        const cwd = formatCwd(ctx.sessionManager.getCwd());
        const bottomLeft = bottomLeftText(theme, cwd, statuses);
        const usage = computeSessionUsage(ctx);
        const usageStats = [
          `${span(theme, "accent", "↑")}${span(theme, "text", formatTokens(usage.input))}`,
          `${span(theme, "success", "↓")}${span(theme, "text", formatTokens(usage.output))}`,
          `${span(theme, "muted", "R")}${span(theme, "text", formatTokens(usage.cacheRead))}`,
          `${span(theme, "muted", "W")}${span(theme, "text", formatTokens(usage.cacheWrite))}`,
        ].join(separator(theme, " "));
        const turnTime =
          isWorking && turnStartedAt !== undefined
            ? `${separator(theme)}${span(theme, "text", formatDuration(Date.now() - turnStartedAt))}`
            : "";
        const bottomRight = ` ${usageStats}${turnTime}${separator(theme)}${span(theme, "muted", "$")}${span(theme, "text", usage.cost.toFixed(3))} `;
        const horizontalBorder = border("─").repeat(innerWidth);
        const nativeLines = lines.slice(1);
        let editorLines = nativeLines.slice(0, -1);
        let autocompleteLines: string[] = [];

        if (this.isShowingAutocomplete()) {
          const editorBottomIndex = nativeLines.findIndex(
            (line) =>
              line === horizontalBorder ||
              (line.includes("↓") &&
                line.includes(" more ") &&
                visibleWidth(line) === innerWidth),
          );

          if (
            editorBottomIndex >= 0 &&
            editorBottomIndex < nativeLines.length - 1
          ) {
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
            (maximumWidth) =>
              bottomLeftText(theme, cwd, statuses, maximumWidth),
          ),
        ];
      }
    }

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new PiEditorFrame(tui, theme, keybindings),
    );
  });
}
