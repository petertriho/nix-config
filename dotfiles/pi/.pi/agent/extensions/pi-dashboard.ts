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
  sanitizePlainTerminalText,
  span,
  type ShellTheme,
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

export type DashboardData = {
  version: string;
  commands: DashboardCommand[];
  commandsLoading: boolean;
};

const DASHBOARD_COMMAND_LIMIT = 4;

type RandomSource = () => number;

function normalizeAutocompleteCommand(
  item: AutocompleteItem,
): DashboardCommand | undefined {
  const name = sanitizePlainTerminalText(item.value).replace(/^\/+/, "").trim();
  if (!name) return undefined;
  const description = sanitizePlainTerminalText(item.description ?? "").trim();
  return {
    name,
    ...(description ? { description } : {}),
  };
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
  limit = DASHBOARD_COMMAND_LIMIT,
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

function renderDashboardContent(
  theme: ShellTheme,
  data: DashboardData,
  width: number,
): string[] {
  if (width <= 0) return ["", ""];

  const fit = (line: string) => truncateToWidth(line, width, "");
  const logo =
    width >= 70
      ? ["██████  ", "██  ██  ", "████  ██", "██    ██"]
      : ["███ ", "█ █ ", "██ █", "█  █"];
  const logoRows = logo.map((line) => span(theme, "accent", line));
  logoRows.push(
    `${span(theme, "text", "PI")}${span(theme, "dim", ` · v${data.version}`)}`,
  );

  const contentRows = (contentWidth: number) => {
    const hint =
      contentWidth >= 28
        ? `${span(theme, "text", "COMMAND DECK")}${span(
            theme,
            "dim",
            "  type / to browse",
          )}`
        : span(theme, "text", "COMMAND DECK");
    let commandRows: string[];
    if (data.commandsLoading) {
      commandRows = [span(theme, "muted", "01  discovering commands…")];
    } else if (data.commands.length === 0) {
      commandRows = [span(theme, "muted", "01  type / to browse commands")];
    } else {
      const names = data.commands.map(
        (command) => `/${sanitizePlainTerminalText(command.name)}`,
      );
      const indexWidth = Math.max(2, String(data.commands.length).length);
      const markerWidth = indexWidth + 2;
      const nameColumnWidth = Math.min(
        Math.max(...names.map(visibleWidth)),
        Math.max(0, Math.floor((contentWidth - markerWidth) * 0.45)),
      );
      commandRows = data.commands.map((command, index) => {
        const marker = `${String(index + 1).padStart(indexWidth, "0")}  `;
        const name = truncateToWidth(
          `/${sanitizePlainTerminalText(command.name)}`,
          nameColumnWidth,
          "",
        );
        const descriptionWidth = Math.max(
          0,
          contentWidth - markerWidth - nameColumnWidth - 2,
        );
        const description = truncateToWidth(
          sanitizePlainTerminalText(command.description ?? ""),
          descriptionWidth,
          "",
        );
        const padding = description
          ? " ".repeat(Math.max(2, nameColumnWidth - visibleWidth(name) + 2))
          : "";
        const styledMarker = span(
          theme,
          index === 0 ? "accent" : "dim",
          marker,
        );
        const styledName = span(theme, index === 0 ? "accent" : "text", name);
        return `${styledMarker}${styledName}${padding}${span(theme, "dim", description)}`;
      });
    }

    return [hint, ...commandRows];
  };

  if (width >= 50) {
    const logoWidth = Math.max(...logoRows.map(visibleWidth));
    const availableContentWidth = Math.max(0, width - logoWidth - 3);
    const rowsContent = contentRows(availableContentWidth);
    const rowCount = Math.max(logoRows.length, rowsContent.length);
    const rows = Array.from({ length: rowCount }, (_, index) => {
      const logoText = logoRows[index] ?? "";
      const logoColumn = `${logoText}${" ".repeat(
        Math.max(0, logoWidth - visibleWidth(logoText)),
      )}`;
      const content = rowsContent[index] ?? "";
      return fit(`${logoColumn}${content ? "   " : ""}${content}`);
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
  let cache:
    | {
        width: number;
        version: string;
        commandsLoading: boolean;
        commandsKey: string;
        lines: string[];
      }
    | undefined;

  return {
    render(width: number): string[] {
      const data = getData();
      const commandsKey = data.commands
        .map((command) => `${command.name}\u0000${command.description ?? ""}`)
        .join("\u0001");

      if (
        cache?.width === width &&
        cache.version === data.version &&
        cache.commandsLoading === data.commandsLoading &&
        cache.commandsKey === commandsKey
      ) {
        return cache.lines;
      }

      const lines = renderDashboard(theme, data, width);
      cache = {
        width,
        version: data.version,
        commandsLoading: data.commandsLoading,
        commandsKey,
        lines,
      };
      return lines;
    },
    invalidate(): void {
      cache = undefined;
    },
  };
}

export default function piDashboard(pi: ExtensionAPI): void {
  let activeTui: TUI | undefined;
  let dashboardCommands: DashboardCommand[] = [];
  let commandsLoading = false;
  let commandPoolKey = "";
  let dashboardGeneration = 0;
  let commandDiscoveryAbort: AbortController | undefined;
  let tuiSessionActive = false;

  function resetDashboardState(): void {
    dashboardCommands = [];
    commandPoolKey = "";
    commandsLoading = false;
  }

  function installCommandDiscovery(
    ctx: ExtensionContext,
    generation: number,
  ): void {
    const controller = commandDiscoveryAbort;
    if (!controller) return;

    ctx.ui.addAutocompleteProvider((provider) => {
      void discoverDashboardCommands(provider, controller.signal)
        .then((commands) => {
          if (
            controller.signal.aborted ||
            !tuiSessionActive ||
            dashboardGeneration !== generation
          ) {
            return;
          }
          const poolKey = commands
            .map(
              (command) => `${command.name}\u0000${command.description ?? ""}`,
            )
            .join("\u0001");
          if (poolKey !== commandPoolKey) {
            dashboardCommands = sampleDashboardCommands(commands);
            commandPoolKey = poolKey;
          }
          commandsLoading = false;
          activeTui?.requestRender();
        })
        .catch(() => {
          if (
            controller.signal.aborted ||
            !tuiSessionActive ||
            dashboardGeneration !== generation
          ) {
            return;
          }
          resetDashboardState();
          activeTui?.requestRender();
        });
      return provider;
    });
  }

  pi.on("session_shutdown", () => {
    commandDiscoveryAbort?.abort();
    commandDiscoveryAbort = undefined;
    tuiSessionActive = false;
    dashboardGeneration += 1;
    activeTui = undefined;
    resetDashboardState();
  });

  pi.on("session_start", (_event, ctx) => {
    tuiSessionActive = ctx.mode === "tui";
    if (!tuiSessionActive) {
      commandDiscoveryAbort?.abort();
      commandDiscoveryAbort = undefined;
      dashboardGeneration += 1;
      activeTui = undefined;
      resetDashboardState();
      return;
    }

    dashboardCommands = [];
    commandPoolKey = "";
    commandsLoading = true;
    dashboardGeneration += 1;
    const generation = dashboardGeneration;
    commandDiscoveryAbort?.abort();
    commandDiscoveryAbort = new AbortController();
    installCommandDiscovery(ctx, generation);
    ctx.ui.setHeader((tui, theme) => {
      activeTui = tui;
      return createDashboardComponent(theme, () => ({
        version: VERSION,
        commands: dashboardCommands,
        commandsLoading,
      }));
    });
  });
}
