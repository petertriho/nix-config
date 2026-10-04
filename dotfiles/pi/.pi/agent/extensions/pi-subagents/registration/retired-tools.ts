import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { SubagentRuntime } from "../runtime/refresh.ts";
import type { ExecutionRuntime } from "../runtime/execution.ts";
import { interruptToolRenderers, listToolRenderers, resumeToolRenderers } from "../presentation/tool-renderers.ts";
import { SUBAGENT_INTERRUPT_DESCRIPTION, SUBAGENTS_LIST_DESCRIPTION, SUBAGENT_RESUME_DESCRIPTION } from "./descriptions.ts";

export type RetiredToolFixtures = Map<string, ReturnType<typeof defineTool>>;

export function registerRetiredTools(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  runtime: SubagentRuntime,
  execution: ExecutionRuntime,
  retiredToolFixtures: RetiredToolFixtures,
  shouldRegister: (name: string) => boolean
): void {
  const { discoverAgentDefinitions } = discovery;
  const { handleSubagentInterrupt } = runtime;
  const { executeSubagentResume } = execution;
  if (shouldRegister("AgentInterrupt"))
    pi.registerTool({
      name: "AgentInterrupt",
      label: "Interrupt Agent",
      description: SUBAGENT_INTERRUPT_DESCRIPTION,
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Running agent ID" })),
        name: Type.Optional(Type.String({ description: "Exact running agent name" })),
      }),
      async execute(_toolCallId, params) {
        return handleSubagentInterrupt(params);
      },
    });

  if (shouldRegister("subagent_interrupt"))
    retiredToolFixtures.set("subagent_interrupt", defineTool({
      name: "subagent_interrupt",
      label: "Interrupt Subagent",
      description: SUBAGENT_INTERRUPT_DESCRIPTION,
      promptSnippet: SUBAGENT_INTERRUPT_DESCRIPTION,
      parameters: Type.Object({
        id: Type.Optional(
          Type.String({ description: "Running subagent id (8 hex chars from the subagent tool result details.id). Omit when using name." }),
        ),
        name: Type.Optional(
          Type.String({ description: "Exact running subagent display name as passed to the subagent tool (for example \"Scout\")." }),
        ),
      }),

      async execute(_toolCallId, params) {
        return handleSubagentInterrupt(params);
      },

      ...interruptToolRenderers,

    }));

  if (shouldRegister("subagents_list"))
    retiredToolFixtures.set("subagents_list", defineTool({
      name: "subagents_list",
      label: "List Subagents",
      description: SUBAGENTS_LIST_DESCRIPTION,
      promptSnippet: SUBAGENTS_LIST_DESCRIPTION,
      parameters: Type.Object({}),

      async execute() {
        const list = discoverAgentDefinitions().filter((agent) => !agent.disableModelInvocation);

        if (list.length === 0) {
          return {
            content: [{ type: "text", text: "No subagent definitions found." }],
            details: { agents: [] },
          };
        }

        const lines = list.map((a) => {
          const badge = a.source === "project" ? " (project)" : "";
          const desc = a.description ? ` — ${a.description}` : "";
          const model = a.model ? ` [${a.model}]` : "";
          return `• ${a.name}${badge}${model}${desc}`;
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { agents: list },
        };
      },

      ...listToolRenderers,

    }));

  if (shouldRegister("subagent_resume"))
    retiredToolFixtures.set("subagent_resume", defineTool({
      name: "subagent_resume",
      label: "Resume Subagent",
      description: SUBAGENT_RESUME_DESCRIPTION,
      promptSnippet: SUBAGENT_RESUME_DESCRIPTION,
      parameters: Type.Object({
        sessionPath: Type.String({ description: "Path to the session .jsonl file to resume" }),
        name: Type.Optional(
          Type.String({ description: "Display name for the pane. Default: 'Resume'" }),
        ),
        message: Type.Optional(
          Type.String({
            description: "Optional message to send after resuming (e.g. follow-up instructions)",
          }),
        ),
        autoExit: Type.Optional(
          Type.Boolean({
            description:
              "Whether the resumed session should automatically exit after completing its response. Defaults to true for autonomous follow-up work; set false for interactive resumed sessions.",
          }),
        ),
        model: Type.Optional(
          Type.String({
            description:
              "Model policy for the resumed session: 'previous' (default; the sidecar's last successful model), 'parent', 'pick', or an explicit 'provider/model[:thinking]' value. Sessions without a launch-profile sidecar keep the legacy behavior when this is omitted.",
          }),
        ),
      }),

      ...resumeToolRenderers,

      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        return executeSubagentResume(pi, params, ctx);
      },
    }));
}
