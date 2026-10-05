import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { formatElapsed } from "../execution/services.ts";
import { formatUsageSummary, type SubagentUsageSummary } from "../telemetry/usage.ts";
import {
  formatIdentity, formatKeyHint, formatMetadata, formatSeparator,
  formatState, formatStateLabel, sanitizeDisplayLine, sanitizeDisplayText,
  span, type SemanticState,
} from "./ui.ts";
import type { StatusTransitionItem } from "./status-message.ts";

export function registerMessageRenderers(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("subagent_result", (message, options, theme) => {
    const details = message.details as
      | {
          name?: string;
          exitCode?: number;
          errorMessage?: string;
          error?: string;
          elapsed?: number;
          agent?: string;
          sessionFile?: string;
          usage?: SubagentUsageSummary;
        }
      | undefined;
    if (!details) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const name = details.name ?? "subagent";
        const exitCode = details.exitCode ?? 0;
        const errorMessage = typeof details.errorMessage === "string" ? details.errorMessage : "";
        const genericError = typeof details.error === "string" ? details.error : "";
        const failed = exitCode !== 0 || Boolean(errorMessage) || Boolean(genericError);
        const elapsed = details.elapsed == null ? "?" : formatElapsed(details.elapsed);
        const bgFn = failed
          ? (text: string) => theme.bg("toolErrorBg", text)
          : (text: string) => theme.bg("toolSuccessBg", text);
        const state = failed ? "failed" : "completed";
        const status = errorMessage
          ? "failed (provider/agent error)"
          : failed
            ? `failed (exit ${exitCode})`
            : "completed";
        const header =
          `${formatState(theme, state, { glyphOnly: true })} ` +
          `${formatIdentity(theme, name, details.agent)}` +
          `${formatSeparator(theme, "—")}` +
          `${formatStateLabel(theme, state, status)} ` +
          `${formatMetadata(theme, `(${elapsed})`)}`;
        // The compact usage/context-pressure line is rendered from
        // details.usage under the header, so the copy appended to the
        // model-visible content is stripped here to avoid duplication.
        const usageLine = formatUsageSummary(details.usage);
        const rawContent = typeof message.content === "string" ? message.content : "";

        const summary = sanitizeDisplayText(
          (usageLine
            ? rawContent
              .replace(/\n\nSession: .+\nResume: .+$/, "")
              .replace(/\n\nUsage: .+$/, "")
            : rawContent)
          .replace(/\n\nSession: .+\nResume: .+$/, "")
          .replace(`Sub-agent "${name}" completed (${elapsed}).\n\n`, "")
          .replace(`Sub-agent "${name}" failed (exit code ${exitCode}).\n\n`, "")
          .replace(
            new RegExp(
              `^Sub-agent "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" failed after ${elapsed} \\(provider/agent error — auto-retry exhausted\\)\\.\\n\\n`,
            ),
            "",
          ),
        );
        const outputPad = Number.isFinite(options.outputPad)
          ? Math.max(0, Math.floor(options.outputPad))
          : 1;
        const lineWidth = Math.max(0, width - outputPad * 2);
        const contentLines = [truncateToWidth(header, lineWidth, "")];
        if (usageLine) {
          contentLines.push(truncateToWidth(span(theme, "dim", sanitizeDisplayLine(usageLine)), lineWidth, ""));
        }
        const summaryLines = summary ? summary.split("\n") : [];

        if (options.expanded) {
          for (const line of summaryLines) {
            contentLines.push(truncateToWidth(line, lineWidth, ""));
          }
          if (details.sessionFile) {
            const sessionFile = sanitizeDisplayLine(details.sessionFile);
            contentLines.push("");
            contentLines.push(
              truncateToWidth(
                span(theme, "dim", `Session: ${sessionFile}`),
                lineWidth,
                "",
              ),
            );
            contentLines.push(
              truncateToWidth(
                span(theme, "dim", `Resume:  pi --session ${sessionFile}`),
                lineWidth,
                "",
              ),
            );
          }
        } else {
          const previewLines = summaryLines.slice(0, 5);
          for (const line of previewLines) {
            contentLines.push(
              truncateToWidth(span(theme, "dim", line), lineWidth, ""),
            );
          }
          if (summaryLines.length > 5) {
            contentLines.push(
              truncateToWidth(
                formatMetadata(theme, `… ${summaryLines.length - 5} more lines`),
                lineWidth,
                "",
              ),
            );
          }
          contentLines.push(
            truncateToWidth(
              formatKeyHint(theme, keyText("app.tools.expand"), "to expand"),
              lineWidth,
              "",
            ),
          );
        }

        const box = new Box(outputPad, 1, bgFn);
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });

  pi.registerMessageRenderer("subagent_status", (message, options, theme) => {
    const details = message.details as
      | { lines?: string[]; items?: StatusTransitionItem[]; overflow?: number }
      | undefined;
    const lines = Array.isArray(details?.lines) ? details.lines : [];
    const items = Array.isArray(details?.items) ? details.items : [];
    const overflow = typeof details?.overflow === "number" ? details.overflow : 0;
    if (items.length === 0 && lines.length === 0 && overflow === 0) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const outputPad = Number.isFinite(options.outputPad)
          ? Math.max(0, Math.floor(options.outputPad))
          : 1;
        const lineWidth = Math.max(0, width - outputPad * 2);
        const contentLines = [
          truncateToWidth(
            `${span(theme, "accent", "●")} ${formatIdentity(theme, "Subagent status")}`,
            lineWidth,
            "",
          ),
        ];

        if (items.length > 0) {
          for (const item of items) {
            let state: SemanticState = item.kind;
            if (item.transition === "recovered") {
              state = item.kind === "waiting" ? "waiting" : "active";
            }

            const detailLabel =
              item.kind === "active"
                ? item.activityLabel ?? item.activeScope
                : item.statusLabel;
            const duration =
              item.kind === "active"
                ? item.activeDurationText
                : item.kind === "waiting"
                  ? item.waitingDurationText
                  : item.kind === "stalled"
                    ? item.snapshotProblemText
                    : undefined;
            const stateLabel = item.transition === "recovered"
              ? "recovered"
              : undefined;
            const detail = detailLabel
              ? `${formatSeparator(theme)}${formatMetadata(theme, detailLabel)}`
              : "";
            const durationText = duration
              ? ` ${formatMetadata(theme, duration)}`
              : "";
            const row =
              `${formatIdentity(theme, item.name)}${formatSeparator(theme)}` +
              `${formatState(theme, state, { label: stateLabel })}` +
              `${formatSeparator(theme)}${formatMetadata(theme, item.elapsedText)}` +
              `${detail}${durationText}`;
            contentLines.push(truncateToWidth(row, lineWidth, ""));
          }
        } else {
          for (const line of lines) {
            contentLines.push(
              span(
                theme,
                "dim",
                truncateToWidth(sanitizeDisplayLine(line), lineWidth, ""),
              ),
            );
          }
        }

        if (overflow > 0) {
          contentLines.push(
            truncateToWidth(
              formatMetadata(theme, `+${overflow} more running.`),
              lineWidth,
              "",
            ),
          );
        }
        if (!options.expanded) {
          contentLines.push(
            truncateToWidth(
              formatKeyHint(theme, keyText("app.tools.expand"), "to expand"),
              lineWidth,
              "",
            ),
          );
        }

        const box = new Box(
          outputPad,
          1,
          (text: string) => theme.bg("customMessageBg", text),
        );
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });

  pi.registerMessageRenderer("subagent_ping", (message, options, theme) => {
    const details = message.details as
      | { name?: string; agent?: string; message?: string; sessionFile?: string }
      | undefined;
    if (!details) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const name = details.name ?? "subagent";
        const header =
          `${formatState(theme, "help", { glyphOnly: true })} ` +
          `${formatIdentity(theme, name, details.agent)}` +
          `${formatSeparator(theme, "—")}` +
          `${formatStateLabel(theme, "help")}`;
        const outputPad = Number.isFinite(options.outputPad)
          ? Math.max(0, Math.floor(options.outputPad))
          : 1;
        const lineWidth = Math.max(0, width - outputPad * 2);
        const contentLines = [truncateToWidth(header, lineWidth, "")];
        const messageLines = sanitizeDisplayText(details.message ?? "").split("\n");

        if (options.expanded) {
          contentLines.push("");
          for (const line of messageLines) {
            contentLines.push(truncateToWidth(line, lineWidth, ""));
          }
          if (details.sessionFile) {
            contentLines.push("");
            contentLines.push(
              truncateToWidth(
                formatMetadata(
                  theme,
                  `Session: ${sanitizeDisplayLine(details.sessionFile)}`,
                ),
                lineWidth,
                "",
              ),
            );
          }
        } else {
          const preview = messageLines[0] ?? "";
          contentLines.push(
            truncateToWidth(span(theme, "dim", preview), lineWidth, ""),
          );
          contentLines.push(
            truncateToWidth(
              formatKeyHint(theme, keyText("app.tools.expand"), "to expand"),
              lineWidth,
              "",
            ),
          );
        }

        const box = new Box(
          outputPad,
          1,
          (text: string) => theme.bg("customMessageBg", text),
        );
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });
}
