import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { applyOuterMargin } from "./pi-tui-shell.ts";

const ENTRY_TYPE = "pi-message-diagnostics";

type UsageCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

type DiagnosticsUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: UsageCost;
};

export type MessageDiagnosticsEntry = {
  version: 1;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  provider?: string;
  model?: string;
  api?: string;
  stopReason?: string;
  errorMessage?: string;
  usage: DiagnosticsUsage;
};

type InteractionState = Omit<
  MessageDiagnosticsEntry,
  "version" | "completedAt" | "durationMs"
>;

type ThemeColor = Parameters<Theme["fg"]>[0];

type CollapsedSection = {
  key: "failure" | "model" | "tokens" | "cache" | "cost" | "success";
  text: string;
};

function emptyUsage(): DiagnosticsUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function skipControlSequence(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index + 1;
  }
  return text.length;
}

function skipControlString(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x07) return index + 1;
    if (
      code === 0x1b &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) === 0x5c
    ) {
      return index + 2;
    }
  }
  return text.length;
}

function stripTerminalControls(value: string): string {
  let text = "";

  for (let index = 0; index < value.length; ) {
    const code = value.charCodeAt(index);
    if (code === 0x1b) {
      const next = value.charCodeAt(index + 1);
      if (next === 0x5b) {
        index = skipControlSequence(value, index + 2);
        continue;
      }
      if ([0x50, 0x58, 0x5d, 0x5e, 0x5f].includes(next)) {
        index = skipControlString(value, index + 2);
        continue;
      }
      index += Math.min(2, value.length - index);
      continue;
    }
    if (code === 0x9b) {
      index = skipControlSequence(value, index + 1);
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      text += " ";
      index += 1;
      continue;
    }
    text += value[index];
    index += 1;
  }

  return text;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = stripTerminalControls(value).replace(/ +/g, " ").trim();
  return text || undefined;
}

function normalizeUsage(value: unknown): DiagnosticsUsage | undefined {
  if (!isRecord(value) || !isRecord(value.cost)) return undefined;

  const input = finiteValue(value.input);
  const output = finiteValue(value.output);
  const cacheRead = finiteValue(value.cacheRead);
  const cacheWrite = finiteValue(value.cacheWrite);
  const totalTokens = finiteValue(value.totalTokens);
  const costInput = finiteValue(value.cost.input);
  const costOutput = finiteValue(value.cost.output);
  const costCacheRead = finiteValue(value.cost.cacheRead);
  const costCacheWrite = finiteValue(value.cost.cacheWrite);
  const costTotal = finiteValue(value.cost.total);

  if (
    input === undefined ||
    output === undefined ||
    cacheRead === undefined ||
    cacheWrite === undefined ||
    totalTokens === undefined ||
    costInput === undefined ||
    costOutput === undefined ||
    costCacheRead === undefined ||
    costCacheWrite === undefined ||
    costTotal === undefined
  ) {
    return undefined;
  }

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    cost: {
      input: costInput,
      output: costOutput,
      cacheRead: costCacheRead,
      cacheWrite: costCacheWrite,
      total: costTotal,
    },
  };
}

function normalizeEntry(value: unknown): MessageDiagnosticsEntry | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;

  const startedAt = finiteValue(value.startedAt);
  const completedAt = finiteValue(value.completedAt);
  const durationMs = finiteValue(value.durationMs);
  const usage = normalizeUsage(value.usage);
  if (
    startedAt === undefined ||
    completedAt === undefined ||
    durationMs === undefined ||
    startedAt < 0 ||
    completedAt < 0 ||
    durationMs < 0 ||
    !Number.isFinite(new Date(startedAt).getTime()) ||
    !Number.isFinite(new Date(completedAt).getTime()) ||
    !usage
  ) {
    return undefined;
  }

  return {
    version: 1,
    startedAt,
    completedAt,
    durationMs,
    provider: optionalText(value.provider),
    model: optionalText(value.model),
    api: optionalText(value.api),
    stopReason: optionalText(value.stopReason),
    errorMessage: optionalText(value.errorMessage),
    usage,
  };
}

function addUsage(total: DiagnosticsUsage, usage: unknown): void {
  const value = usage as
    | {
        input?: unknown;
        output?: unknown;
        cacheRead?: unknown;
        cacheWrite?: unknown;
        totalTokens?: unknown;
        cost?: {
          input?: unknown;
          output?: unknown;
          cacheRead?: unknown;
          cacheWrite?: unknown;
          total?: unknown;
        };
      }
    | undefined;

  total.input += finiteNumber(value?.input);
  total.output += finiteNumber(value?.output);
  total.cacheRead += finiteNumber(value?.cacheRead);
  total.cacheWrite += finiteNumber(value?.cacheWrite);
  total.totalTokens += finiteNumber(value?.totalTokens);
  total.cost.input += finiteNumber(value?.cost?.input);
  total.cost.output += finiteNumber(value?.cost?.output);
  total.cost.cacheRead += finiteNumber(value?.cost?.cacheRead);
  total.cost.cacheWrite += finiteNumber(value?.cost?.cacheWrite);
  total.cost.total += finiteNumber(value?.cost?.total);
}

function isTui(ctx: ExtensionContext): boolean {
  return ctx.mode === "tui";
}

function formatDuration(durationMs: number): string {
  const milliseconds = Math.max(0, finiteNumber(durationMs));
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;

  const seconds = milliseconds / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  if (minutes < 60) return `${minutes}m${wholeSeconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

function formatTokens(count: number): string {
  const tokens = Math.max(0, finiteNumber(count));
  if (tokens < 1000) return Math.round(tokens).toString();
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
  if (tokens < 1000000) return `${Math.round(tokens / 1000)}k`;
  if (tokens < 10000000) return `${(tokens / 1000000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000000)}M`;
}

function formatCost(cost: number, decimals: number): string {
  return `$${Math.max(0, finiteNumber(cost)).toFixed(decimals)}`;
}

function completionTime(completedAt: number): string {
  return new Date(completedAt).toLocaleTimeString();
}

function separator(theme: Theme): string {
  return theme.fg("dim", " · ");
}

function joinSections(theme: Theme, sections: string[]): string {
  return sections.join(separator(theme));
}

function modelText(
  data: MessageDiagnosticsEntry,
  theme: Theme,
): string | undefined {
  if (data.provider && data.model) {
    return `${theme.fg("accent", data.provider)}${theme.fg("dim", "/")}${theme.fg("text", data.model)}`;
  }
  const value = data.provider ?? data.model;
  return value ? theme.fg("text", value) : undefined;
}

function outcome(
  data: MessageDiagnosticsEntry,
): { color: ThemeColor; isSuccess: boolean; text: string } | undefined {
  const text = optionalText(data.stopReason);
  if (!text) return undefined;

  const normalized = text.toLowerCase();
  if (normalized === "stop") {
    return { color: "success", isSuccess: true, text };
  }
  if (normalized === "error") {
    return { color: "error", isSuccess: false, text };
  }
  return { color: "warning", isSuccess: false, text };
}

function renderCollapsed(
  data: MessageDiagnosticsEntry,
  width: number,
  theme: Theme,
): string {
  const mandatory = [
    theme.fg("text", completionTime(data.completedAt)),
    theme.fg("text", formatDuration(data.durationMs)),
  ];
  const sections: CollapsedSection[] = [];
  const status = outcome(data);
  const model = modelText(data, theme);

  if (status && !status.isSuccess) {
    sections.push({
      key: "failure",
      text: theme.fg(status.color, status.text),
    });
  }
  if (model) sections.push({ key: "model", text: model });
  sections.push({
    key: "tokens",
    text: `${theme.fg("accent", "↑")}${theme.fg("text", formatTokens(data.usage.input))} ${theme.fg("success", "↓")}${theme.fg("text", formatTokens(data.usage.output))}`,
  });
  if (data.usage.cacheRead !== 0 || data.usage.cacheWrite !== 0) {
    sections.push({
      key: "cache",
      text: `${theme.fg("muted", "R")}${theme.fg("text", formatTokens(data.usage.cacheRead))} ${theme.fg("muted", "W")}${theme.fg("text", formatTokens(data.usage.cacheWrite))}`,
    });
  }
  if (data.usage.cost.total > 0) {
    sections.push({
      key: "cost",
      text: theme.fg("text", formatCost(data.usage.cost.total, 3)),
    });
  }
  if (status?.isSuccess) {
    sections.push({
      key: "success",
      text: theme.fg(status.color, status.text),
    });
  }

  const line = () =>
    `${theme.fg("dim", "└")} ${joinSections(
      theme,
      mandatory.concat(sections.map((section) => section.text)),
    )}`;
  const removalOrder: CollapsedSection["key"][] = [
    "success",
    "cache",
    "cost",
    "tokens",
    "model",
  ];

  for (const key of removalOrder) {
    if (visibleWidth(line()) <= width) break;
    const index = sections.findIndex((section) => section.key === key);
    if (index >= 0) sections.splice(index, 1);
  }

  return truncateToWidth(line(), Math.max(0, width), "");
}

function renderExpanded(
  data: MessageDiagnosticsEntry,
  width: number,
  theme: Theme,
): string[] {
  const status = outcome(data);
  const timing = [
    `${theme.fg("dim", "Completed ")}${theme.fg("text", completionTime(data.completedAt))}`,
    `${theme.fg("dim", "elapsed ")}${theme.fg("text", formatDuration(data.durationMs))}`,
  ];
  if (status) {
    timing.push(
      `${theme.fg("dim", "outcome ")}${theme.fg(status.color, status.text)}`,
    );
  }

  const lines = [`${theme.fg("dim", "└")} ${joinSections(theme, timing)}`];
  const model = modelText(data, theme);
  const modelDetails: string[] = [];
  if (model) modelDetails.push(`${theme.fg("dim", "Model ")}${model}`);
  if (data.api) {
    modelDetails.push(
      `${theme.fg("dim", "API ")}${theme.fg("text", data.api)}`,
    );
  }
  if (modelDetails.length > 0) {
    lines.push(`  ${joinSections(theme, modelDetails)}`);
  }

  lines.push(
    `  ${theme.fg("dim", "Tokens ")}${joinSections(theme, [
      `${theme.fg("dim", "input ")}${theme.fg("text", formatTokens(data.usage.input))}`,
      `${theme.fg("dim", "output ")}${theme.fg("text", formatTokens(data.usage.output))}`,
      `${theme.fg("dim", "cache read ")}${theme.fg("text", formatTokens(data.usage.cacheRead))}`,
      `${theme.fg("dim", "cache write ")}${theme.fg("text", formatTokens(data.usage.cacheWrite))}`,
      `${theme.fg("dim", "total ")}${theme.fg("text", formatTokens(data.usage.totalTokens))}`,
    ])}`,
  );
  if (data.usage.cost.total > 0) {
    lines.push(
      `  ${theme.fg("dim", "Cost ")}${joinSections(theme, [
        `${theme.fg("dim", "input ")}${theme.fg("text", formatCost(data.usage.cost.input, 4))}`,
        `${theme.fg("dim", "output ")}${theme.fg("text", formatCost(data.usage.cost.output, 4))}`,
        `${theme.fg("dim", "cache read ")}${theme.fg("text", formatCost(data.usage.cost.cacheRead, 4))}`,
        `${theme.fg("dim", "cache write ")}${theme.fg("text", formatCost(data.usage.cost.cacheWrite, 4))}`,
        `${theme.fg("dim", "total ")}${theme.fg("text", formatCost(data.usage.cost.total, 4))}`,
      ])}`,
    );
  }

  const errorMessage = optionalText(data.errorMessage);
  if (errorMessage) {
    lines.push(
      `  ${theme.fg("error", "Error ")}${theme.fg("error", errorMessage)}`,
    );
  }

  const availableWidth = Math.max(0, width);
  return lines.map((line) => truncateToWidth(line, availableWidth, ""));
}

export function renderMessageDiagnostics(
  data: MessageDiagnosticsEntry,
  expanded: boolean,
  theme: Theme,
  width: number,
): string[] {
  const contentWidth = Math.max(0, width - 2);
  const lines = expanded
    ? renderExpanded(data, contentWidth, theme)
    : [renderCollapsed(data, contentWidth, theme)];
  return applyOuterMargin(lines, width);
}

class DiagnosticsComponent implements Component {
  private readonly data: MessageDiagnosticsEntry;
  private readonly expanded: boolean;
  private readonly theme: Theme;

  constructor(data: MessageDiagnosticsEntry, expanded: boolean, theme: Theme) {
    this.data = data;
    this.expanded = expanded;
    this.theme = theme;
  }

  render(width: number): string[] {
    return renderMessageDiagnostics(
      this.data,
      this.expanded,
      this.theme,
      width,
    );
  }

  invalidate(): void {}
}

export default function piMessageDiagnostics(pi: ExtensionAPI): void {
  let interaction: InteractionState | undefined;

  pi.registerEntryRenderer<MessageDiagnosticsEntry>(
    ENTRY_TYPE,
    (entry, { expanded }, theme) => {
      const data = normalizeEntry(entry.data);
      return data ? new DiagnosticsComponent(data, expanded, theme) : undefined;
    },
  );

  pi.on("session_start", (_event, ctx) => {
    interaction = undefined;
    if (!isTui(ctx)) return;
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!isTui(ctx) || interaction) return;
    interaction = {
      startedAt: Date.now(),
      usage: emptyUsage(),
    };
  });

  pi.on("message_end", (event, ctx) => {
    if (!isTui(ctx) || !interaction) return;

    if (
      event.message.role === "assistant" ||
      event.message.role === "toolResult"
    ) {
      addUsage(interaction.usage, event.message.usage);
    }

    if (event.message.role === "assistant") {
      interaction.provider = optionalText(event.message.provider);
      interaction.model = optionalText(event.message.model);
      interaction.api = optionalText(event.message.api);
      interaction.stopReason = optionalText(event.message.stopReason);
      interaction.errorMessage = optionalText(event.message.errorMessage);
    }
  });

  pi.on("session_compact", (event, ctx) => {
    if (!isTui(ctx) || !interaction) return;

    let usage = event.compactionEntry.usage;
    const entries = ctx.sessionManager.getEntries();
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry?.type !== "compaction") continue;
      usage = entry.usage;
      break;
    }
    addUsage(interaction.usage, usage);
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!isTui(ctx)) {
      interaction = undefined;
      return;
    }

    const settled = interaction;
    if (!settled) return;

    const completedAt = Date.now();
    interaction = ctx.isIdle()
      ? undefined
      : { startedAt: completedAt, usage: emptyUsage() };
    pi.appendEntry<MessageDiagnosticsEntry>(ENTRY_TYPE, {
      version: 1,
      ...settled,
      completedAt,
      durationMs: Math.max(0, completedAt - settled.startedAt),
    });
  });

  pi.on("session_before_tree", (event, ctx) => {
    if (!isTui(ctx) || !event.preparation.oldLeafId) return;

    const oldLeaf = ctx.sessionManager.getEntry(event.preparation.oldLeafId);
    if (
      oldLeaf?.type === "custom" &&
      oldLeaf.customType === ENTRY_TYPE &&
      oldLeaf.parentId === event.preparation.targetId
    ) {
      return { cancel: true };
    }
  });

  pi.on("session_shutdown", () => {
    interaction = undefined;
  });
}
