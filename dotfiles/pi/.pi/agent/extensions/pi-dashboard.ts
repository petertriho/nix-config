import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteProvider,
  Component,
  TUI,
} from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  applyOuterMargin,
  compactCwd,
  sanitizePlainTerminalText,
  span,
  thinkingLevelText,
  type ShellTheme,
  type ThinkingLevel,
} from "./pi-tui-shell.ts";

/**
 * Header dashboard ("COMMAND DECK"): PI logo plus a rotating sample of
 * slash commands, discovered through the shared autocomplete provider.
 * Split out of pi-tui-shell; shares its text sanitizing and margin helpers.
 */

export type DashboardCommand = {
  name: string;
  description?: string;
};

export type DashboardModel = {
  provider: string;
  id: string;
};

export type DashboardData = {
  version: string;
  model?: DashboardModel;
  thinkingLevel?: ThinkingLevel;
  cwd: string;
  commands: DashboardCommand[];
  commandsLoading: boolean;
};

export const DASHBOARD_ANIMATION_INTERVAL_MS = 180;
export const DASHBOARD_LOGO_CELL_WIDTH = 2;
export const DASHBOARD_WIDE_BREAKPOINT = 90;
export const DASHBOARD_COMMAND_GRID_BREAKPOINT = 110;
export const DASHBOARD_MIN_BOX_WIDTH = 24;
export const DASHBOARD_COMPACT_COMMAND_LIMIT = 6;
export const DASHBOARD_GRID_COMMAND_LIMIT = 10;
export const DASHBOARD_MEDIUM_COMMAND_LIMIT = 2;

type RandomSource = () => number;
export type DashboardLogoColor = "accent" | "error" | "success";
type DashboardLogoCell = DashboardLogoColor | undefined;
type DashboardLogoFrame = readonly (readonly DashboardLogoCell[])[];

export const DASHBOARD_LOGO_FRAMES: readonly DashboardLogoFrame[] = [
  [
    ["accent", undefined, undefined, undefined],
    [undefined, undefined, undefined, undefined],
    [undefined, undefined, undefined, undefined],
    [undefined, undefined, undefined, undefined],
  ],
  [
    ["accent", "accent", undefined, undefined],
    [undefined, undefined, "accent", undefined],
    [undefined, undefined, undefined, undefined],
    [undefined, undefined, undefined, undefined],
  ],
  [
    ["accent", "accent", undefined, undefined],
    ["error", undefined, "accent", undefined],
    [undefined, undefined, undefined, undefined],
    [undefined, undefined, undefined, undefined],
  ],
  [
    ["accent", "accent", undefined, undefined],
    ["error", undefined, "accent", undefined],
    ["error", "error", undefined, undefined],
    [undefined, undefined, undefined, undefined],
  ],
  [
    ["accent", "accent", undefined, undefined],
    ["error", undefined, "accent", undefined],
    ["error", "error", undefined, "success"],
    ["error", undefined, undefined, undefined],
  ],
  [
    ["accent", "accent", undefined, undefined],
    ["error", undefined, "accent", undefined],
    ["error", "error", undefined, "success"],
    ["error", undefined, undefined, "success"],
  ],
  [
    ["accent", "accent", undefined, undefined],
    ["accent", undefined, "accent", undefined],
    ["accent", "error", undefined, "accent"],
    ["error", undefined, undefined, "success"],
  ],
  [
    ["accent", "accent", undefined, undefined],
    ["accent", undefined, "accent", undefined],
    ["accent", "accent", undefined, "accent"],
    ["accent", undefined, undefined, "accent"],
  ],
];

export const DASHBOARD_LOGO_FRAME_COUNT = DASHBOARD_LOGO_FRAMES.length;

export function renderDashboardLogo(
  theme: ShellTheme,
  frameIndex: number,
): string[] {
  const safeIndex = Math.max(
    0,
    Math.min(
      DASHBOARD_LOGO_FRAME_COUNT - 1,
      Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0,
    ),
  );
  const frame = DASHBOARD_LOGO_FRAMES[safeIndex] ?? DASHBOARD_LOGO_FRAMES[0];
  if (!frame) return [];

  return frame.map((row) =>
    row
      .map((color) =>
        color
          ? span(theme, color, "█".repeat(DASHBOARD_LOGO_CELL_WIDTH))
          : " ".repeat(DASHBOARD_LOGO_CELL_WIDTH),
      )
      .join(""),
  );
}

export function formatDashboardModelIdentity(
  theme: ShellTheme,
  model: DashboardModel | undefined,
  thinkingLevel: ThinkingLevel | undefined,
  width: number,
): string {
  const safeWidth = Number.isFinite(width)
    ? Math.max(0, Math.floor(width))
    : 0;
  if (safeWidth === 0) return "";

  const provider = sanitizePlainTerminalText(model?.provider ?? "");
  const id = sanitizePlainTerminalText(model?.id ?? "");
  const sepWidth = visibleWidth(" · ");
  const levelText = thinkingLevelText(theme, thinkingLevel ?? "off");
  const levelWidth = visibleWidth(levelText);
  const thinkLabelWidth = visibleWidth("think ");
  const idOnlyWidth = model
    ? visibleWidth(id)
    : visibleWidth("Model unavailable");
  const identityWidth = model
    ? visibleWidth(provider) + visibleWidth("/") + idOnlyWidth
    : idOnlyWidth;
  const identitySpan = (): string =>
    model
      ? `${span(theme, "accent", provider)}${span(
          theme,
          "dim",
          "/",
        )}${span(theme, "text", id)}`
      : span(theme, "muted", "Model unavailable");
  const idSpan = (): string =>
    model ? span(theme, "text", id) : span(theme, "muted", "Model unavailable");
  const sep = (): string => span(theme, "dim", " · ");
  const withFullLevel = (identityText: string): string =>
    `${identityText}${sep()}${span(theme, "muted", "think ")}${levelText}`;

  // Compaction ladder mirroring the editor's top-left rail: drop the
  // provider, then the `think ` label, then ellipsize the id.
  if (identityWidth + sepWidth + thinkLabelWidth + levelWidth <= safeWidth) {
    return withFullLevel(identitySpan());
  }
  if (idOnlyWidth + sepWidth + thinkLabelWidth + levelWidth <= safeWidth) {
    return withFullLevel(idSpan());
  }
  if (idOnlyWidth + sepWidth + levelWidth <= safeWidth) {
    return `${idSpan()}${sep()}${levelText}`;
  }
  const idBudget = safeWidth - sepWidth - levelWidth;
  if (idBudget > 0) {
    return `${truncateToWidth(
      idSpan(),
      idBudget,
      idBudget > 1 ? "…" : "",
    )}${sep()}${levelText}`;
  }
  if (levelWidth <= safeWidth) return levelText;
  return truncateToWidth(levelText, safeWidth, safeWidth > 1 ? "…" : "");
}

export function formatDashboardDirectory(
  theme: ShellTheme,
  cwd: string,
  width: number,
): string {
  const safeWidth = Number.isFinite(width)
    ? Math.max(0, Math.floor(width))
    : 0;
  if (safeWidth === 0) return "";
  return span(
    theme,
    "accent",
    compactCwd(formatDashboardCwd(cwd), safeWidth),
  );
}

export function formatDashboardCwd(cwd: string): string {
  const sanitizedCwd = sanitizePlainTerminalText(cwd) || ".";
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return sanitizedCwd;

  const resolvedCwd = resolve(sanitizedCwd);
  const resolvedHome = resolve(home);
  const relativeToHome = relative(resolvedHome, resolvedCwd);
  const isInsideHome =
    relativeToHome === "" ||
    (relativeToHome !== ".." &&
      !relativeToHome.startsWith(`..${sep}`) &&
      !isAbsolute(relativeToHome));

  if (!isInsideHome) return sanitizedCwd;
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

export function padDashboardText(text: string, width: number): string {
  if (width <= 0) return "";
  const fitted = truncateToWidth(text, width, width > 1 ? "…" : "");
  return `${fitted}${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}`;
}

export function centerDashboardText(text: string, width: number): string {
  if (width <= 0) return "";
  const fitted = truncateToWidth(text, width, width > 1 ? "…" : "");
  const remaining = Math.max(0, width - visibleWidth(fitted));
  const left = Math.floor(remaining / 2);
  return `${" ".repeat(left)}${fitted}${" ".repeat(remaining - left)}`;
}

export function renderDashboardTopBorder(
  theme: ShellTheme,
  width: number,
  title: string,
): string {
  if (width <= 0) return "";
  if (width === 1) return span(theme, "dim", "╭");
  if (width === 2) return span(theme, "dim", "╭╮");

  const innerWidth = width - 2;
  const safeTitle = sanitizePlainTerminalText(title);
  const titleText = truncateToWidth(
    safeTitle ? ` ${safeTitle} ` : "",
    innerWidth,
    "",
  );
  const remaining = Math.max(0, innerWidth - visibleWidth(titleText));
  const leftRule = remaining > 0 ? "─" : "";
  const rightRule = "─".repeat(Math.max(0, remaining - leftRule.length));
  return `${span(theme, "dim", `╭${leftRule}`)}${span(
    theme,
    "accent",
    titleText,
  )}${span(theme, "dim", `${rightRule}╮`)}`;
}

export function renderDashboardBoxRow(
  theme: ShellTheme,
  width: number,
  content: string,
): string {
  if (width <= 0) return "";
  if (width === 1) return span(theme, "dim", "│");
  return `${span(theme, "dim", "│")}${padDashboardText(
    content,
    width - 2,
  )}${span(theme, "dim", "│")}`;
}

export function renderDashboardDivider(
  theme: ShellTheme,
  width: number,
): string {
  if (width <= 0) return "";
  if (width === 1) return span(theme, "dim", "├");
  return span(theme, "dim", `├${"─".repeat(Math.max(0, width - 2))}┤`);
}

export function renderDashboardBottomBorder(
  theme: ShellTheme,
  width: number,
): string {
  if (width <= 0) return "";
  if (width === 1) return span(theme, "dim", "╰");
  return span(theme, "dim", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

export function calculateDashboardColumns(innerWidth: number): {
  left: number;
  divider: number;
  sidebar: number;
} {
  const safeWidth = Number.isFinite(innerWidth)
    ? Math.max(0, Math.floor(innerWidth))
    : 0;
  const divider = safeWidth > 0 ? 1 : 0;
  const available = Math.max(0, safeWidth - divider);
  const left = Math.round(available * 0.3);
  return {
    left,
    divider,
    sidebar: available - left,
  };
}

function normalizeAutocompleteCommand(
  item: AutocompleteItem,
): DashboardCommand | undefined {
  const name = sanitizePlainTerminalText(item.value).replace(/^\/+/, "").trim();
  if (!name) return undefined;
  const description = sanitizePlainTerminalText(item.description ?? "").trim();
  if (!description) return { name };
  return { name, description };
}

export async function discoverDashboardCommands(
  provider: AutocompleteProvider,
  signal = new AbortController().signal,
): Promise<DashboardCommand[]> {
  const suggestions = await provider.getSuggestions(["/"], 0, 1, { signal });
  if (!suggestions) return [];

  const commands: DashboardCommand[] = [];
  const seen = new Set<string>();
  for (const item of suggestions.items) {
    const command = normalizeAutocompleteCommand(item);
    if (!command || seen.has(command.name)) continue;
    seen.add(command.name);
    commands.push(command);
  }
  return commands;
}

export function sampleDashboardCommands(
  commands: readonly DashboardCommand[],
  limit = DASHBOARD_COMPACT_COMMAND_LIMIT,
  random: RandomSource = Math.random,
): DashboardCommand[] {
  const pool = [...commands];
  const count = Math.min(pool.length, Math.max(0, Math.floor(limit)));
  for (let index = 0; index < count; index += 1) {
    const value = random();
    const draw = Number.isFinite(value)
      ? Math.max(0, Math.min(1 - Number.EPSILON, value))
      : 0;
    const selected = index + Math.floor(draw * (pool.length - index));
    const currentCommand = pool[index];
    const selectedCommand = pool[selected];
    if (!currentCommand || !selectedCommand) break;
    pool[index] = selectedCommand;
    pool[selected] = currentCommand;
  }
  return pool.slice(0, count);
}

type CommandStateRowsOptions = {
  theme: ShellTheme;
  data: DashboardData;
  width: number;
  limit: number;
  includeDescriptions: boolean;
};

export function formatDashboardCommandCell(
  theme: ShellTheme,
  command: DashboardCommand,
  width: number,
  includeDescription: boolean,
): string {
  const safeWidth = Number.isFinite(width)
    ? Math.max(0, Math.floor(width))
    : 0;
  if (safeWidth === 0) return "";

  const name = `/${sanitizePlainTerminalText(command.name)}`;
  const description = sanitizePlainTerminalText(command.description ?? "");
  let content: string;

  if (!includeDescription || !description) {
    content = span(
      theme,
      "text",
      truncateToWidth(name, safeWidth, safeWidth > 1 ? "…" : ""),
    );
  } else {
    const descriptionWidth = safeWidth - visibleWidth(name) - 2;
    if (descriptionWidth < 8) {
      content = span(
        theme,
        "text",
        truncateToWidth(name, safeWidth, safeWidth > 1 ? "…" : ""),
      );
    } else {
      const fittedDescription = truncateToWidth(
        description,
        descriptionWidth,
        descriptionWidth > 1 ? "…" : "",
      );
      content = `${span(theme, "text", name)}  ${span(
        theme,
        "dim",
        fittedDescription,
      )}`;
    }
  }

  return padDashboardText(content, safeWidth);
}

function commandStateRows({
  theme,
  data,
  width,
  limit,
  includeDescriptions,
}: CommandStateRowsOptions): string[] {
  if (data.commandsLoading) {
    return [span(theme, "muted", "Discovering commands…")];
  }
  if (data.commands.length === 0) {
    return [span(theme, "muted", "No suggestions yet")];
  }

  return data.commands
    .slice(0, limit)
    .map((command) =>
      formatDashboardCommandCell(theme, command, width, includeDescriptions),
    );
}

function renderCenteredDashboardHero(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
  frameIndex: number,
  includeLogoSpacer = false,
): string[] {
  const logoRows = renderDashboardLogo(theme, frameIndex).map((row) =>
    centerDashboardText(row, width),
  );
  const metadataRows = [
    formatDashboardModelIdentity(
      theme,
      data.model,
      data.thinkingLevel,
      width,
    ),
    formatDashboardDirectory(theme, data.cwd, width),
  ].map((row) => centerDashboardText(row, width));

  return includeLogoSpacer
    ? [...logoRows, " ".repeat(Math.max(0, width)), ...metadataRows]
    : [...logoRows, ...metadataRows];
}

export function renderWideDashboardHero(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
  frameIndex: number,
): string[] {
  const blank = " ".repeat(Math.max(0, width));
  const logoRows = renderDashboardLogo(theme, frameIndex).map((row) =>
    centerDashboardText(row, width),
  );
  const modelRow = centerDashboardText(
    formatDashboardModelIdentity(theme, data.model, data.thinkingLevel, width),
    width,
  );
  const directoryRow = centerDashboardText(
    formatDashboardDirectory(theme, data.cwd, width),
    width,
  );
  return [blank, ...logoRows, blank, modelRow, directoryRow, blank];
}

export function renderCompactWideDashboardSidebar(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
): string[] {
  const safeWidth = Number.isFinite(width)
    ? Math.max(0, Math.floor(width))
    : 0;
  const rows = [
    span(theme, "accent", "Quick actions"),
    span(theme, "dim", "Type / to browse commands"),
    span(theme, "accent", "Commands"),
    ...commandStateRows({
      theme,
      data,
      width: safeWidth,
      limit: DASHBOARD_COMPACT_COMMAND_LIMIT,
      includeDescriptions: true,
    }),
  ];

  return Array.from({ length: 9 }, (_, index) =>
    padDashboardText(rows[index] ?? "", safeWidth),
  );
}

function renderDashboardCommandGridRow(
  theme: ShellTheme,
  commands: readonly DashboardCommand[],
  width: number,
): string {
  if (commands.length === 0) return " ".repeat(Math.max(0, width));
  const first = commands[0];
  if (!first) return " ".repeat(Math.max(0, width));
  const second = commands[1];
  if (!second) {
    return formatDashboardCommandCell(theme, first, width, true);
  }

  const separatorText = " │ ";
  const separatorWidth = visibleWidth(separatorText);
  if (width <= separatorWidth) {
    return formatDashboardCommandCell(theme, first, width, true);
  }
  const available = width - separatorWidth;
  const leftWidth = Math.floor(available / 2);
  const rightWidth = available - leftWidth;
  return `${formatDashboardCommandCell(
    theme,
    first,
    leftWidth,
    true,
  )}${span(theme, "dim", separatorText)}${formatDashboardCommandCell(
    theme,
    second,
    rightWidth,
    true,
  )}`;
}

export function renderGridWideDashboardSidebar(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
): string[] {
  const safeWidth = Number.isFinite(width)
    ? Math.max(0, Math.floor(width))
    : 0;
  let commandRows: string[];

  if (data.commandsLoading || data.commands.length === 0) {
    const status = commandStateRows({
      theme,
      data,
      width: safeWidth,
      limit: DASHBOARD_GRID_COMMAND_LIMIT,
      includeDescriptions: true,
    })[0];
    commandRows = [
      padDashboardText(status ?? "", safeWidth),
      " ".repeat(safeWidth),
    ];
  } else {
    const commands = data.commands.slice(0, DASHBOARD_GRID_COMMAND_LIMIT);
    commandRows = [
      renderDashboardCommandGridRow(theme, commands.slice(0, 2), safeWidth),
      renderDashboardCommandGridRow(theme, commands.slice(2, 4), safeWidth),
      renderDashboardCommandGridRow(theme, commands.slice(4, 6), safeWidth),
      renderDashboardCommandGridRow(theme, commands.slice(6, 8), safeWidth),
      renderDashboardCommandGridRow(theme, commands.slice(8, 10), safeWidth),
    ];
  }

  const rows = [
    span(theme, "accent", "Quick actions"),
    span(theme, "dim", "Type / to browse commands"),
    span(theme, "dim", "─".repeat(safeWidth)),
    span(theme, "accent", "Commands"),
    ...commandRows,
  ];

  return Array.from({ length: 9 }, (_, index) =>
    padDashboardText(rows[index] ?? "", safeWidth),
  );
}

function renderWideDashboard(
  theme: ShellTheme,
  data: DashboardData,
  terminalWidth: number,
  boxWidth: number,
  frameIndex: number,
): string[] {
  const innerWidth = boxWidth - 2;
  const columns = calculateDashboardColumns(innerWidth);
  const leftRows = renderWideDashboardHero(
    theme,
    data,
    columns.left,
    frameIndex,
  );
  const rightRows =
    terminalWidth >= DASHBOARD_COMMAND_GRID_BREAKPOINT
      ? renderGridWideDashboardSidebar(theme, data, columns.sidebar)
      : renderCompactWideDashboardSidebar(theme, data, columns.sidebar);
  const bodyRows = Array.from({ length: 9 }, (_, index) => {
    const left = padDashboardText(leftRows[index] ?? "", columns.left);
    const divider =
      columns.divider > 0 ? span(theme, "dim", "│") : "";
    const right = padDashboardText(rightRows[index] ?? "", columns.sidebar);
    return renderDashboardBoxRow(
      theme,
      boxWidth,
      `${left}${divider}${right}`,
    );
  });

  return [
    renderDashboardTopBorder(
      theme,
      boxWidth,
      `Pi v${sanitizePlainTerminalText(data.version)}`,
    ),
    ...bodyRows,
    renderDashboardBottomBorder(theme, boxWidth),
  ];
}

function renderMediumDashboard(
  theme: ShellTheme,
  data: DashboardData,
  boxWidth: number,
  frameIndex: number,
): string[] {
  const innerWidth = boxWidth - 2;
  const blankRow = renderDashboardBoxRow(theme, boxWidth, "");
  const rows = [
    blankRow,
    ...renderCenteredDashboardHero(
      theme,
      data,
      innerWidth,
      frameIndex,
    ).map((row) => renderDashboardBoxRow(theme, boxWidth, row)),
    blankRow,
  ];

  const actionRows = [
    span(theme, "accent", "Quick actions"),
    span(theme, "dim", "Type / to browse commands"),
    span(theme, "accent", "Commands"),
    ...commandStateRows({
      theme,
      data,
      width: innerWidth,
      limit: DASHBOARD_MEDIUM_COMMAND_LIMIT,
      includeDescriptions: false,
    }),
  ].map((row) => renderDashboardBoxRow(theme, boxWidth, row));

  return [
    renderDashboardTopBorder(
      theme,
      boxWidth,
      `Pi v${sanitizePlainTerminalText(data.version)}`,
    ),
    ...rows,
    renderDashboardDivider(theme, boxWidth),
    ...actionRows,
    renderDashboardBottomBorder(theme, boxWidth),
  ];
}

function renderDashboardContent(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
  frameIndex: number,
): string[] {
  if (width <= 0) return [];
  const boxWidth = Math.max(0, width - 2);
  if (boxWidth < DASHBOARD_MIN_BOX_WIDTH) {
    const version = sanitizePlainTerminalText(data.version);
    return [
      padDashboardText(
        `Pi v${version}`,
        boxWidth,
      ),
    ];
  }
  if (width >= DASHBOARD_WIDE_BREAKPOINT) {
    return renderWideDashboard(theme, data, width, boxWidth, frameIndex);
  }
  return renderMediumDashboard(theme, data, boxWidth, frameIndex);
}

export function renderDashboard(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
  frameIndex = DASHBOARD_LOGO_FRAME_COUNT - 1,
): string[] {
  return applyOuterMargin(
    renderDashboardContent(theme, data, width, frameIndex),
    width,
  );
}

export type DashboardAnimationTimers = {
  setInterval(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
};

export type DashboardComponent = Component & {
  dispose(): void;
};

type DashboardAnimationState = {
  readonly frameIndex: number;
  dispose(): void;
};

function createDashboardAnimation(
  onAdvance: () => void,
  timers: DashboardAnimationTimers,
): DashboardAnimationState {
  let frameIndex = 0;
  let disposed = false;
  let animationTimer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (animationTimer === undefined) return;
    timers.clearInterval(animationTimer);
    animationTimer = undefined;
  };

  if (DASHBOARD_LOGO_FRAME_COUNT > 1) {
    animationTimer = timers.setInterval(() => {
      if (disposed || frameIndex >= DASHBOARD_LOGO_FRAME_COUNT - 1) {
        stop();
        return;
      }
      frameIndex += 1;
      if (frameIndex >= DASHBOARD_LOGO_FRAME_COUNT - 1) stop();
      onAdvance();
    }, DASHBOARD_ANIMATION_INTERVAL_MS);
  }

  return {
    get frameIndex() {
      return frameIndex;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
    },
  };
}

function dashboardDataCacheKey(data: DashboardData): string {
  return [
    data.version,
    data.model?.provider ?? "",
    data.model?.id ?? "",
    data.thinkingLevel ?? "",
    data.cwd,
    data.commandsLoading ? "1" : "0",
    data.commands
      .map((command) => `${command.name}\u0000${command.description ?? ""}`)
      .join("\u0001"),
  ].join("\u0002");
}

export function createDashboardComponent(
  theme: ShellTheme,
  getData: () => DashboardData,
  requestRender: () => void = () => {},
  timers: DashboardAnimationTimers = {
    setInterval,
    clearInterval,
  },
): DashboardComponent {
  let cache:
    | {
        width: number;
        frameIndex: number;
        dataKey: string;
        lines: string[];
      }
    | undefined;

  const animation = createDashboardAnimation(() => {
    cache = undefined;
    requestRender();
  }, timers);

  return {
    render(width: number): string[] {
      const data = getData();
      const dataKey = dashboardDataCacheKey(data);

      if (
        cache?.width === width &&
        cache.frameIndex === animation.frameIndex &&
        cache.dataKey === dataKey
      ) {
        return cache.lines;
      }

      const lines = renderDashboard(theme, data, width, animation.frameIndex);
      cache = {
        width,
        frameIndex: animation.frameIndex,
        dataKey,
        lines,
      };
      return lines;
    },
    invalidate(): void {
      cache = undefined;
    },
    dispose(): void {
      animation.dispose();
    },
  };
}

type DashboardRuntime = {
  pi: ExtensionAPI;
  animationTimers: DashboardAnimationTimers | undefined;
  activeTui: TUI | undefined;
  activeComponent: DashboardComponent | undefined;
  commands: DashboardCommand[];
  commandsLoading: boolean;
  commandPoolKey: string;
  generation: number;
  discoveryAbort: AbortController | undefined;
  tuiSessionActive: boolean;
};

function dashboardCommandPoolKey(commands: readonly DashboardCommand[]): string {
  return commands
    .map((command) => `${command.name}\u0000${command.description ?? ""}`)
    .join("\u0001");
}

function disposeActiveDashboard(runtime: DashboardRuntime): void {
  runtime.activeComponent?.dispose();
  runtime.activeComponent = undefined;
}

function resetDashboardRuntimeData(runtime: DashboardRuntime): void {
  runtime.commands = [];
  runtime.commandPoolKey = "";
  runtime.commandsLoading = false;
}

function isCurrentDashboardDiscovery(
  runtime: DashboardRuntime,
  controller: AbortController,
  generation: number,
): boolean {
  return (
    !controller.signal.aborted &&
    runtime.tuiSessionActive &&
    runtime.generation === generation
  );
}

function installDashboardCommandDiscovery(
  runtime: DashboardRuntime,
  ctx: ExtensionContext,
  controller: AbortController,
  generation: number,
): void {
  ctx.ui.addAutocompleteProvider((provider) => {
    void discoverDashboardCommands(provider, controller.signal)
      .then((commands) => {
        if (!isCurrentDashboardDiscovery(runtime, controller, generation)) {
          return;
        }
        const poolKey = dashboardCommandPoolKey(commands);
        if (poolKey !== runtime.commandPoolKey) {
          runtime.commands = sampleDashboardCommands(
            commands,
            DASHBOARD_GRID_COMMAND_LIMIT,
          );
          runtime.commandPoolKey = poolKey;
        }
        runtime.commandsLoading = false;
        runtime.activeTui?.requestRender();
      })
      .catch(() => {
        if (!isCurrentDashboardDiscovery(runtime, controller, generation)) {
          return;
        }
        resetDashboardRuntimeData(runtime);
        runtime.activeTui?.requestRender();
      });
    return provider;
  });
}

function dashboardData(
  runtime: DashboardRuntime,
  ctx: ExtensionContext,
): DashboardData {
  return {
    version: VERSION,
    model: ctx.model
      ? {
          provider: ctx.model.provider,
          id: ctx.model.id,
        }
      : undefined,
    thinkingLevel: runtime.pi.getThinkingLevel(),
    cwd: ctx.cwd,
    commands: runtime.commands,
    commandsLoading: runtime.commandsLoading,
  };
}

function mountDashboard(
  runtime: DashboardRuntime,
  ctx: ExtensionContext,
  tui: TUI,
  theme: ShellTheme,
): DashboardComponent {
  disposeActiveDashboard(runtime);
  runtime.activeTui = tui;
  let component: DashboardComponent;
  component = createDashboardComponent(
    theme,
    () => dashboardData(runtime, ctx),
    () => {
      if (
        !runtime.tuiSessionActive ||
        runtime.activeComponent !== component
      ) {
        return;
      }
      tui.requestRender();
    },
    runtime.animationTimers,
  );
  runtime.activeComponent = component;
  return component;
}

function startDashboardSession(
  runtime: DashboardRuntime,
  ctx: ExtensionContext,
): void {
  runtime.discoveryAbort?.abort();
  runtime.discoveryAbort = undefined;
  runtime.generation += 1;
  disposeActiveDashboard(runtime);
  runtime.activeTui = undefined;
  resetDashboardRuntimeData(runtime);

  runtime.tuiSessionActive = ctx.mode === "tui";
  if (!runtime.tuiSessionActive) return;

  runtime.commandsLoading = true;
  const controller = new AbortController();
  runtime.discoveryAbort = controller;
  installDashboardCommandDiscovery(
    runtime,
    ctx,
    controller,
    runtime.generation,
  );
  ctx.ui.setHeader((tui, theme) =>
    mountDashboard(runtime, ctx, tui, theme),
  );
}

function shutdownDashboardSession(runtime: DashboardRuntime): void {
  runtime.discoveryAbort?.abort();
  runtime.discoveryAbort = undefined;
  runtime.tuiSessionActive = false;
  runtime.generation += 1;
  disposeActiveDashboard(runtime);
  runtime.activeTui = undefined;
  resetDashboardRuntimeData(runtime);
}

function requestDashboardRender(runtime: DashboardRuntime): void {
  if (!runtime.tuiSessionActive) return;
  runtime.activeTui?.requestRender();
}

export default function piDashboard(
  pi: ExtensionAPI,
  animationTimers?: DashboardAnimationTimers,
): void {
  const runtime: DashboardRuntime = {
    pi,
    animationTimers,
    activeTui: undefined,
    activeComponent: undefined,
    commands: [],
    commandsLoading: false,
    commandPoolKey: "",
    generation: 0,
    discoveryAbort: undefined,
    tuiSessionActive: false,
  };

  pi.on("model_select", () => requestDashboardRender(runtime));
  pi.on("thinking_level_select", () => requestDashboardRender(runtime));
  pi.on("session_info_changed", () => requestDashboardRender(runtime));
  pi.on("session_shutdown", () => shutdownDashboardSession(runtime));
  pi.on("session_start", (_event, ctx) =>
    startDashboardSession(runtime, ctx),
  );
}
