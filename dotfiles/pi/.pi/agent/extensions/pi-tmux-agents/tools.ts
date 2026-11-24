import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { parseList, type CliResult, type CliRunner } from "./cli.ts";
import {
  interruptToolRenderers, listToolRenderers, readToolRenderers, sendToolRenderers,
  spawnToolRenderers, stopToolRenderers, type ToolAction, type ToolDetails,
} from "./presentation/renderers.ts";

const SKILL_HINT = "Load the pi-tmux-agents skill first for the procedure.";

export const SpawnParams = Type.Object({
  prompt: Type.String({ description: "Self-contained task for the agent. It cannot see this conversation." }),
  cwd: Type.Optional(Type.String({ description: "Folder of the agent, usually a git worktree (default: the current folder)" })),
  name: Type.Optional(Type.String({ description: "Display name (default: the folder name)" })),
  session: Type.Optional(Type.String({ description: "tmux session for the window (default: the session of this pane)" })),
  session_dir: Type.Optional(Type.String({ description: "Root folder of a new tmux session (default: cwd)" })),
  window: Type.Optional(Type.String({ description: "tmux window name (default: the folder name)" })),
  model: Type.Optional(Type.String({ description: "pi model, such as provider/id[:thinking] (default: the pi default)" })),
  thinking: Type.Optional(Type.String({ description: "pi thinking level (default: the pi default)" })),
  pi_args: Type.Optional(Type.Array(Type.String(), { description: "More pi arguments, one item for each argument" })),
});

export const AgentParams = Type.Object({
  agent: Type.String({ description: "Agent id, or a name that only one agent has" }),
});

export const SendParams = Type.Object({
  agent: Type.String({ description: "Agent id, or a name that only one agent has" }),
  message: Type.String({ description: "Message to the agent" }),
});

export const ReadParams = Type.Object({
  agent: Type.String({ description: "Agent id, or a name that only one agent has" }),
  lines: Type.Optional(Type.Integer({ minimum: 1, description: "Number of screen lines (default 60)" })),
});

export type SpawnInput = Static<typeof SpawnParams>;

/** The CLI arguments of a spawn. The prompt comes after --, as it can start with - or @. */
export function spawnArgs(lead: string, params: SpawnInput): string[] {
  const args = ["spawn", "--lead", lead];
  const options: Array<[string, string | undefined]> = [
    ["--cwd", params.cwd], ["--name", params.name], ["--session", params.session],
    ["--session-dir", params.session_dir], ["--window", params.window],
    ["--model", params.model], ["--thinking", params.thinking],
  ];
  for (const [flag, value] of options) {
    if (value?.trim()) args.push(flag, value);
  }
  for (const arg of params.pi_args ?? []) args.push("--pi-arg", arg);
  args.push("--", params.prompt);
  return args;
}

export function sendArgs(agent: string, message: string): string[] {
  return ["send", agent, "--", message];
}

export function readArgs(agent: string, lines?: number): string[] {
  return lines ? ["read", agent, "--lines", String(lines)] : ["read", agent];
}

export function listArgs(lead: string): string[] {
  return ["list", "--json", "--lead", lead];
}

/** Fields of the stderr trailer, such as id=... target=... pane=... */
export function trailerFields(stderr: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of stderr.split("\n")) {
    if (!line.startsWith("pi-tmux-agents: ")) continue;
    for (const match of line.matchAll(/(\w+)=(\S+)/g)) fields[match[1]] ??= match[2];
  }
  return fields;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: ToolDetails;
  isError?: boolean;
}

function ok(text: string, details: ToolDetails): ToolResult {
  return { content: [{ type: "text", text }], details };
}

function failure(action: ToolAction, agent: string | undefined, result: CliResult): ToolResult {
  const error = result.stderr.trim() || result.stdout.trim() || `pi-tmux-agents exited with status ${result.code}`;
  return {
    content: [{ type: "text", text: error }],
    details: { action, ...(agent ? { agent } : {}), error },
    isError: true,
  };
}

export interface ToolRuntime {
  run: CliRunner;
  /** Polls at once, so that the panel shows the change. */
  refresh(): void;
}

function leadId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

export function registerTools(pi: Pick<ExtensionAPI, "registerTool">, runtime: ToolRuntime): void {
  const exec = (args: string[], ctx: ExtensionContext, signal?: AbortSignal) =>
    runtime.run(args, { signal, timeout: 30_000, cwd: ctx.cwd });

  pi.registerTool({
    name: "TmuxAgentSpawn",
    label: "Spawn tmux agent",
    description: `Start a pi agent in a new tmux window, with a task. Returns at once. Each turn result arrives later as a follow-up message. ${SKILL_HINT}`,
    parameters: SpawnParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(spawnArgs(leadId(ctx), params), ctx, signal);
      runtime.refresh();
      if (result.code !== 0) return failure("spawn", params.name, result);
      const id = result.stdout.trim();
      const fields = trailerFields(result.stderr);
      const notes = result.stderr.split("\n").filter((line) => line.trim() && !line.includes(`id=${id} `));
      const name = params.name?.trim() || undefined;
      const text = [
        `Started pi tmux agent ${name ? `"${name}" ` : ""}id=${id} target=${fields.target ?? "?"} pane=${fields.pane ?? "?"}.`,
        "Its turn results arrive as follow-up messages. Do not poll.",
        ...notes,
      ].join("\n");
      return ok(text, { action: "spawn", id, name, target: fields.target, status: "started" });
    },
    ...spawnToolRenderers,
  });

  pi.registerTool({
    name: "TmuxAgentSend",
    label: "Send to tmux agent",
    description: `Send a follow-up message to a pi tmux agent. Returns at once, and the turn result arrives as a follow-up message. Resumes a stopped agent. ${SKILL_HINT}`,
    parameters: SendParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(sendArgs(params.agent, params.message), ctx, signal);
      runtime.refresh();
      if (result.code !== 0) return failure("send", params.agent, result);
      const fields = trailerFields(result.stderr);
      const reopened = result.stderr.includes("reopened");
      const text = reopened
        ? `Reopened agent ${params.agent} on its pi session in ${fields.target ?? "?"}. The turn result arrives as a follow-up message.`
        : `The message is in the inbox of agent ${params.agent}. The turn result arrives as a follow-up message.`;
      return ok(text, {
        action: "send", agent: params.agent, id: fields.id, target: fields.target,
        status: reopened ? "reopened" : "queued",
      });
    },
    ...sendToolRenderers,
  });

  pi.registerTool({
    name: "TmuxAgentRead",
    label: "Read tmux agent",
    description: `Read the last lines of the tmux window of a pi tmux agent. It only reads. ${SKILL_HINT}`,
    parameters: ReadParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(readArgs(params.agent, params.lines), ctx, signal);
      if (result.code !== 0) return failure("read", params.agent, result);
      const screen = result.stdout.replace(/\n+$/, "");
      return ok(screen || "(The screen is empty.)", {
        action: "read", agent: params.agent, status: "read", screen,
      });
    },
    ...readToolRenderers,
  });

  pi.registerTool({
    name: "TmuxAgentInterrupt",
    label: "Interrupt tmux agent",
    description: `Stop the current turn of a pi tmux agent, or cancel its dialog. The result arrives as a follow-up message. ${SKILL_HINT}`,
    parameters: AgentParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(["interrupt", params.agent], ctx, signal);
      runtime.refresh();
      if (result.code !== 0) return failure("interrupt", params.agent, result);
      const noTurn = result.stderr.includes("no turn runs");
      return ok(
        noTurn
          ? `Agent ${params.agent} runs no turn. Nothing was interrupted.`
          : `Asked agent ${params.agent} to stop its turn. An interrupted result arrives as a follow-up message.`,
        { action: "interrupt", agent: params.agent, status: noTurn ? "no_turn" : "interrupt_requested" },
      );
    },
    ...interruptToolRenderers,
  });

  pi.registerTool({
    name: "TmuxAgentStop",
    label: "Stop tmux agent",
    description: `Close the window of a pi tmux agent. The folder and the pi session stay, and TmuxAgentSend resumes it. ${SKILL_HINT}`,
    parameters: AgentParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(["stop", params.agent], ctx, signal);
      runtime.refresh();
      if (result.code !== 0) return failure("stop", params.agent, result);
      return ok(`Stopped agent ${params.agent}. TmuxAgentSend resumes it.`, {
        action: "stop", agent: params.agent, status: "stopped",
      });
    },
    ...stopToolRenderers,
  });

  pi.registerTool({
    name: "TmuxAgentList",
    label: "List tmux agents",
    description: `List the pi tmux agents of this session with their status. ${SKILL_HINT}`,
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const result = await exec(listArgs(leadId(ctx)), ctx, signal);
      if (result.code !== 0) return failure("list", undefined, result);
      const agents = parseList(result.stdout);
      const text = agents.length === 0
        ? "This session has no pi tmux agents."
        : agents.map((agent) =>
          `${agent.id}\t${agent.name}\t${agent.status}\t${agent.target}\t${agent.cwd}`).join("\n");
      return ok(text, { action: "list", status: "listed", agents });
    },
    ...listToolRenderers,
  });
}
