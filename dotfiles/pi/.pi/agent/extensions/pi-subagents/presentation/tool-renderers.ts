import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import type { SubagentResumeParams } from "../execution/services.ts";
import type { SubagentParamsType } from "../registration/schemas.ts";
import type { ListedAgentDefinition } from "../profiles/discovery.ts";
import {
  formatIdentity, formatMetadata, formatSeparator, formatState,
  sanitizeDisplayText, sanitizeDisplayLine, span, type SemanticState, type UiTheme,
} from "./ui.ts";

type ToolRenderResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: unknown;
};

function renderToolStateRow(
  theme: UiTheme,
  input: {
    name: string;
    role?: string;
    state: SemanticState;
    label: string;
    metadata?: string;
  },
): string {
  const metadata = input.metadata
    ? `${formatSeparator(theme)}${formatMetadata(theme, input.metadata)}`
    : "";
  return `${formatIdentity(theme, input.name, input.role)}${metadata}${formatSeparator(theme)}${formatState(theme, input.state, { label: input.label })}`;
}

function renderToolFallback(result: ToolRenderResult, theme: UiTheme): Text {
  const details =
    result.details != null && typeof result.details === "object"
      ? result.details as { error?: unknown }
      : undefined;
  const first = result.content?.[0];
  const text = sanitizeDisplayText(
    first?.type === "text" && typeof first.text === "string" ? first.text : "",
  );
  const failed = details?.error != null;
  const state = failed ? "failed" : "completed";
  const body = span(theme, failed ? "error" : "toolOutput", text);
  return new Text(
    `${formatState(theme, state)}${text ? `${formatSeparator(theme)}${body}` : ""}`,
    0,
    0,
  );
}

export const ordinaryToolRenderers = {
  renderCall(args: Partial<SubagentParamsType>, theme: UiTheme) {
    const partialArgs = args as Record<string, unknown>;
    const name = typeof partialArgs.name === "string" && partialArgs.name ? partialArgs.name : "(unnamed)";
    const task = typeof partialArgs.task === "string" ? partialArgs.task : "";
    const agent = typeof partialArgs.agent === "string" ? partialArgs.agent : undefined;
    const cwd = typeof partialArgs.cwd === "string" && partialArgs.cwd
      ? `in ${partialArgs.cwd}`
      : undefined;
    let text = renderToolStateRow(theme, {
      name,
      role: agent,
      state: "starting",
      label: "pending",
      metadata: cwd,
    });

    if (task) {
      const taskLines = sanitizeDisplayText(task).split("\n");
      const firstLine = taskLines.find((line) => line.trim()) ?? "";
      const preview = truncateToWidth(firstLine, 100, "…");
      if (preview) {
        text += `\n${span(theme, "toolOutput", preview)}`;
      }
      const totalLines = taskLines.length;
      if (totalLines > 1) {
        text += ` ${formatMetadata(theme, `(${totalLines} lines)`)}`;
      }
    }

    return new Text(text, 0, 0);
  },

  renderResult(result: ToolRenderResult, _opts: unknown, theme: UiTheme) {
    const details = result.details as { name?: string; status?: string } | undefined;
    const name = details?.name ?? "(unnamed)";

    if (details?.status === "started") {
      return new Text(
        renderToolStateRow(theme, {
          name,
          state: "starting",
          label: "started",
        }),
        0,
        0,
      );
    }

    return renderToolFallback(result, theme);
  },
};

export const interruptToolRenderers = {
  renderCall(args: { id?: string; name?: string }, theme: UiTheme) {
    const target = args.id ? `${args.id}` : args.name ?? "(unknown)";
    return new Text(
      renderToolStateRow(theme, {
        name: target,
        state: "help",
        label: "interrupt turn",
      }),
      0,
      0,
    );
  },

  renderResult(result: ToolRenderResult, _opts: unknown, theme: UiTheme) {
    const details = result.details as { status?: string; name?: string; id?: string } | undefined;
    if (details?.status === "interrupt_requested") {
      return new Text(
        renderToolStateRow(theme, {
          name: details.name ?? details.id ?? "subagent",
          state: "help",
          label: "interrupt requested",
        }),
        0,
        0,
      );
    }

    return renderToolFallback(result, theme);
  },
};

export const listToolRenderers = {
  renderResult(result: ToolRenderResult, _opts: unknown, theme: UiTheme) {
    const details = result.details as { agents?: ListedAgentDefinition[] } | undefined;
    const agents = details?.agents ?? [];
    if (agents.length === 0) {
      return new Text(
        `${formatState(theme, "completed", { glyphOnly: true })}${formatSeparator(theme)}${formatMetadata(theme, "No subagent definitions found.")}`,
        0,
        0,
      );
    }
    const lines = agents.map((agent, index) => {
      const state = index === 0
        ? `${formatState(theme, "completed", { glyphOnly: true })}${formatSeparator(theme)}`
        : "  ";
      const badge = agent.source === "project"
        ? span(theme, "accent", " (project)")
        : "";
      const model = agent.model
        ? ` ${formatMetadata(theme, `[${sanitizeDisplayLine(agent.model)}]`)}`
        : "";
      const description = agent.description
        ? ` ${formatMetadata(theme, `— ${sanitizeDisplayLine(agent.description)}`)}`
        : "";
      return `${state}${formatIdentity(theme, agent.name)}${badge}${model}${description}`;
    });
    return new Text(lines.join("\n"), 0, 0);
  },
};

export const resumeToolRenderers = {
  renderCall(args: Partial<SubagentResumeParams>, theme: UiTheme) {
    const name = args.name ?? "Resume";
    return new Text(
      renderToolStateRow(theme, {
        name,
        state: "starting",
        label: "resuming session",
      }),
      0,
      0,
    );
  },

  renderResult(result: ToolRenderResult, _opts: unknown, theme: UiTheme) {
    const details = result.details as
      | { name?: string; status?: string; rollover?: string }
      | undefined;
    const name = details?.name ?? "Resume";

    if (details?.status === "started") {
      return new Text(
        renderToolStateRow(theme, {
          name,
          state: "starting",
          label: details?.rollover === "fresh" ? "fresh rollover started" : "resumed",
        }),
        0,
        0,
      );
    }

    return renderToolFallback(result, theme);
  },

};
