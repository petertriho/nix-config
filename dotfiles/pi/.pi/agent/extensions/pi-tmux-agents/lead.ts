import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
  createCliRunner, parseList, parsePull, stateRoot, type CliRunner, type ListedAgent,
  type PullRecord,
} from "./cli.ts";
import { buildResultContent, registerResultRenderer, RESULT_TYPE } from "./presentation/renderers.ts";
import { panelAgents, renderWidgetLines, WIDGET_KEY } from "./presentation/widget.ts";
import { listArgs, registerTools } from "./tools.ts";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "skills");

type Timer = ReturnType<typeof setTimeout>;

export interface LeadOptions {
  run?: CliRunner;
  stateRoot?: string;
  /** Poll interval while the lead has a live agent. */
  fastMs?: number;
  /** Poll interval otherwise, and the longest time between two full polls. */
  slowMs?: number;
  setTimeout?: (callback: () => void, ms: number) => Timer;
  clearTimeout?: (timer: Timer) => void;
  now?: () => number;
  /** A change key for a path, such as "mtime:size". */
  statKey?: (path: string) => string;
}

export interface LeadMode {
  /** Runs one poll. A forced poll ignores the change check. */
  poll(force?: boolean): Promise<void>;
  agents(): readonly ListedAgent[];
}

function defaultStatKey(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "-";
  }
}

/** A live agent can end a turn. A stopped or dead agent cannot. */
export function hasLiveAgent(agents: readonly ListedAgent[]): boolean {
  return agents.some((agent) => agent.status !== "stopped" && agent.status !== "dead");
}

/**
 * Lead mode: the tools, the panel, and the results. The lead is the pi
 * session id, so after /new or /resume the panel shows the agents of the new
 * session, and the results of the other agents wait in their state until
 * their session is active again.
 */
export function registerLeadMode(pi: ExtensionAPI, options: LeadOptions = {}): LeadMode {
  const run = options.run ?? createCliRunner(pi.exec.bind(pi));
  const root = options.stateRoot ?? stateRoot();
  const fastMs = options.fastMs ?? 1_000;
  const slowMs = options.slowMs ?? 10_000;
  const startTimer = options.setTimeout ?? setTimeout;
  const stopTimer = options.clearTimeout ?? clearTimeout;
  const now = options.now ?? Date.now;
  const statKey = options.statKey ?? defaultStatKey;

  let ctx: ExtensionContext | undefined;
  let leadSession: string | undefined;
  let agents: ListedAgent[] = [];
  let timer: Timer | undefined;
  let polling = false;
  let pollAgain = false;
  let lastKey = "";
  let lastFullPoll = 0;
  let generation = 0;
  let widgetShown = false;
  let tui: TUI | undefined;

  /**
   * Changes on disk. A pane that dies changes no file, so a full poll also
   * runs at least every slowMs.
   */
  function changeKey(): string {
    const parts = [statKey(root)];
    for (const agent of agents) {
      if (!agent.dir) continue;
      for (const file of ["meta.json", "turns.jsonl", "pi.exit"]) {
        parts.push(statKey(join(agent.dir, file)));
      }
    }
    return parts.join("|");
  }

  function updateWidget(): void {
    if (!ctx?.hasUI) return;
    if (panelAgents(agents).length === 0) {
      if (widgetShown) ctx.ui.setWidget(WIDGET_KEY, undefined);
      widgetShown = false;
      tui = undefined;
      return;
    }
    if (widgetShown) {
      // The rows show the time since each status change.
      tui?.requestRender();
      return;
    }
    ctx.ui.setWidget(
      WIDGET_KEY,
      (widgetTui, theme) => {
        tui = widgetTui;
        return {
          invalidate() {},
          render: (width: number) => renderWidgetLines(theme, agents, width, now()),
        };
      },
      { placement: "aboveEditor" },
    );
    widgetShown = true;
  }

  function deliver(record: PullRecord): void {
    pi.sendMessage(
      { customType: RESULT_TYPE, content: buildResultContent(record), display: true, details: record },
      { triggerTurn: true, deliverAs: "followUp" },
    );
    if (record.event === "waiting" && ctx?.hasUI) {
      ctx.ui.notify(`tmux agent ${record.name} needs input: ${record.message || "a dialog"}`, "warning");
    }
  }

  function schedule(ms?: number): void {
    if (timer !== undefined) stopTimer(timer);
    timer = undefined;
    if (!ctx) return;
    timer = startTimer(() => {
      timer = undefined;
      void poll(false);
    }, ms ?? (hasLiveAgent(agents) ? fastMs : slowMs));
    (timer as { unref?: () => void }).unref?.();
  }

  async function poll(force = false): Promise<void> {
    if (polling) {
      pollAgain = pollAgain || force;
      return;
    }
    const lead = leadSession;
    if (!ctx || !lead) return;
    const started = generation;
    polling = true;
    try {
      const key = changeKey();
      if (!force && key === lastKey && now() - lastFullPoll < slowMs) {
        updateWidget();
        return;
      }
      lastKey = key;
      lastFullPoll = now();
      // pull marks the events as read, so the results go out at once. Only a
      // session switch while pull runs can lose them.
      const pulled = await run(["pull", "--lead", lead, "--json"]);
      if (started !== generation) return;
      if (pulled.code === 0) {
        for (const record of parsePull(pulled.stdout)) deliver(record);
      }
      const listed = await run(listArgs(lead));
      if (started !== generation) return;
      if (listed.code === 0) agents = parseList(listed.stdout);
      lastKey = changeKey();
      updateWidget();
    } catch {
      // A missing CLI or a failed exec: the next poll tries again.
    } finally {
      polling = false;
      if (started === generation) {
        if (pollAgain) {
          pollAgain = false;
          schedule(0);
        } else {
          schedule();
        }
      }
    }
  }

  function reset(): void {
    generation += 1;
    if (timer !== undefined) stopTimer(timer);
    timer = undefined;
    polling = false;
    pollAgain = false;
    agents = [];
    lastKey = "";
    lastFullPoll = 0;
  }

  registerResultRenderer(pi);
  registerTools(pi, {
    run,
    refresh() {
      if (polling) pollAgain = true;
      else schedule(0);
    },
  });

  pi.on("session_start", (_event, startCtx) => {
    reset();
    ctx = startCtx;
    leadSession = startCtx.sessionManager.getSessionId();
    widgetShown = false;
    tui = undefined;
    // Without a UI (print and JSON mode), no result could start a turn.
    if (!startCtx.hasUI) return;
    void poll(true);
  });

  pi.on("session_shutdown", (_event, shutdownCtx) => {
    reset();
    if (widgetShown && shutdownCtx.hasUI) shutdownCtx.ui.setWidget(WIDGET_KEY, undefined);
    widgetShown = false;
    tui = undefined;
    ctx = undefined;
    leadSession = undefined;
  });

  pi.on("resources_discover", () => ({ skillPaths: [SKILLS_DIR] }));

  return {
    poll,
    agents: () => agents,
  };
}
