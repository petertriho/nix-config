import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { describeAgentTypes, findAgentType, type AgentType } from "./agent-types.ts";
import { parseList, type CliResult, type CliRunner, type ListedAgent } from "./cli.ts";
import {
  agentToolRenderers, interruptToolRenderers, listToolRenderers, readToolRenderers,
  sendToolRenderers, stopToolRenderers, type ToolAction, type ToolDetails,
} from "./presentation/renderers.ts";

const SKILL_HINT = "Load the pi-tmux-agents skill before you start agents for code changes, worktrees, or several agents.";
const CLI_TIMEOUT_MS = 30_000;
/** A worktree can need a git fetch first. */
const ISOLATION_TIMEOUT_MS = 300_000;
/** After Esc, the longest wait for the interrupted event of a foreground agent. */
const ABORT_WAIT_S = 10;

export const AgentToolParams = Type.Object({
  description: Type.String({ description: "A short (3-5 word) description of the task" }),
  prompt: Type.String({ description: "The task for the agent. It cannot see this conversation, so give it all the context." }),
  subagent_type: Type.Optional(Type.String({ description: "The agent type (default: general-purpose)" })),
  name: Type.Optional(Type.String({ description: "A name for SendMessage and the panel (default: from the description)" })),
  model: Type.Optional(Type.String({ description: "pi model, such as provider/id[:thinking] (default: the agent type, then the pi default)" })),
  thinking: Type.Optional(Type.String({ description: "pi thinking level (default: the agent type, then the pi default)" })),
  run_in_background: Type.Optional(Type.Boolean({
    description: "Return at once; the result arrives later as a follow-up message (default: false, wait for the result)",
  })),
  cwd: Type.Optional(Type.String({ description: "Folder of the agent (default: the current folder)" })),
  session: Type.Optional(Type.String({ description: "tmux session for the window (default: the session of this pane)" })),
  session_dir: Type.Optional(Type.String({ description: "Root folder of a new tmux session (default: the agent folder)" })),
  window: Type.Optional(Type.String({ description: "tmux window name (default: the agent name)" })),
  isolation: Type.Optional(Type.String({ description: "\"worktree\": run the agent in a new git worktree of the repository of cwd" })),
  worktree_path: Type.Optional(Type.String({ description: "Folder of the new worktree (default: <repository root>/.worktrees/<name>)" })),
  branch: Type.Optional(Type.String({ description: "New branch of the worktree (default: agent/<name>)" })),
  base: Type.Optional(Type.String({ description: "Start point of the branch, such as origin/main (default: HEAD of cwd). A remote ref is fetched first." })),
});

export const SendMessageParams = Type.Object({
  to: Type.String({ description: "Agent id, or the name of an agent of this session" }),
  message: Type.String({ description: "Message to the agent" }),
});

export const AgentRefParams = Type.Object({
  agent: Type.String({ description: "Agent id, or the name of an agent of this session" }),
});

export const AgentReadParams = Type.Object({
  agent: Type.String({ description: "Agent id, or the name of an agent of this session" }),
  lines: Type.Optional(Type.Integer({ minimum: 1, description: "Number of screen lines (default 60)" })),
});

export type AgentToolInput = Static<typeof AgentToolParams>;

/** The slug of the CLI: lower case, with - for each run of other characters. */
export function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/[.-]{2,}/g, (run) => run[0])
    .replace(/^[.-]/, "").replace(/-$/, "");
  return slug || "agent";
}

/** base, or base-2, base-3, ... when an agent of this session has the name. */
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  return name;
}

/**
 * An id, or the id of the one agent of this session with the name. Other
 * references go to the CLI as they are, which searches all agents.
 */
export function resolveAgentRef(ref: string, agents: readonly ListedAgent[]): string {
  const wanted = ref.trim();
  if (agents.some((agent) => agent.id === wanted)) return wanted;
  const named = agents.filter((agent) => agent.name === wanted);
  return named.length === 1 ? named[0].id : wanted;
}

function option(args: string[], flag: string, value: string | undefined): void {
  if (value?.trim()) args.push(flag, value.trim());
}

/** The CLI arguments of Agent. The prompt comes after --, as it can start with - or @. */
export function agentSpawnArgs(
  lead: string,
  params: AgentToolInput,
  type: AgentType,
  name: string,
  promptFile?: string,
): string[] {
  const args = ["spawn", "--lead", lead, "--name", name, "--agent-type", type.name];
  option(args, "--description", params.description.replace(/\s+/g, " "));
  option(args, "--cwd", params.cwd);
  option(args, "--session", params.session);
  option(args, "--session-dir", params.session_dir);
  args.push("--window", params.window?.trim() || name);
  option(args, "--model", params.model || type.model);
  option(args, "--thinking", params.thinking || type.thinking);
  option(args, "--tools", type.tools);
  if (type.autoStop) args.push("--auto-stop");
  option(args, "--system-prompt-file", promptFile);
  if (params.isolation === "worktree") {
    args.push("--isolation", "worktree");
    option(args, "--worktree-path", params.worktree_path);
    option(args, "--branch", params.branch);
    option(args, "--base", params.base);
  }
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

/** The lead poll leaves out the agents that a foreground Agent call waits for. */
export function pullArgs(lead: string, skip: Iterable<string> = []): string[] {
  const args = ["pull", "--lead", lead, "--json"];
  for (const id of skip) args.push("--skip", id);
  return args;
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

/** The trailer lines of the CLI, which name the event. */
function trailerLines(stderr: string): string[] {
  return stderr.split("\n").filter((line) => line.startsWith("pi-tmux-agents: "));
}

export function agentToolDescription(types: readonly AgentType[]): string {
  return [
    "Start a pi agent in a new tmux window to do a task.",
    "By default the call waits for the end of the agent's turn and returns its reply. Agent calls in one message run in parallel.",
    "With run_in_background: true it returns at once, and the result arrives later as a follow-up message. Do not poll for it.",
    "The agent cannot see this conversation: give it a self-contained prompt. Continue an agent with SendMessage.",
    SKILL_HINT,
    "",
    "Agent types:",
    describeAgentTypes(types),
  ].join("\n");
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: ToolDetails;
  isError?: boolean;
}

function ok(text: string, details: ToolDetails): ToolResult {
  return { content: [{ type: "text", text }], details };
}

function errorResult(text: string, details: ToolDetails): ToolResult {
  return { content: [{ type: "text", text }], details: { ...details, error: text }, isError: true };
}

function failure(action: ToolAction, agent: string | undefined, result: CliResult): ToolResult {
  const error = result.stderr.trim() || result.stdout.trim() || `pi-tmux-agents exited with status ${result.code}`;
  return errorResult(error, { action, ...(agent ? { agent } : {}) });
}

/** The tool result of a foreground Agent call, from the exit code of `wait`. */
export function foregroundResult(details: ToolDetails, waited: CliResult): ToolResult {
  const reply = waited.stdout.replace(/\n+$/, "");
  const trailer = trailerLines(waited.stderr).join("\n");
  const event = trailerFields(waited.stderr).event;
  const who = `Agent "${details.name}" (id ${details.id}, ${details.target ?? "?"})`;
  const autoStopped = waited.stderr.includes("auto-stopped");
  switch (waited.code) {
    case 0:
      return ok([
        reply || "(The reply has no text.)",
        "",
        `${who} ended its turn.${autoStopped ? " Its window closed (auto-stop)." : ""} Continue it with SendMessage.`,
        trailer,
      ].join("\n").trim(), { ...details, status: "completed", event: "stop", autoStopped });
    case 3:
      return ok([
        `${who} waits on a dialog. Only the user can answer it, in the window ${details.target ?? "of the agent"}.`,
        "Its later results arrive as follow-up messages. AgentInterrupt cancels the dialog.",
        "",
        reply,
        trailer,
      ].join("\n").trim(), { ...details, status: "waiting", event: "waiting" });
    case 1:
      return errorResult([
        `${who} ended its turn with ${event === "interrupted" ? "an interrupt" : "an error"}.`,
        reply,
        waited.stderr.trim(),
      ].filter(Boolean).join("\n\n"), { ...details, status: event === "interrupted" ? "interrupted" : "failed", event });
    default:
      return errorResult([
        waited.code === 2 ? `${who} is gone or stopped.` : `pi-tmux-agents wait exited with status ${waited.code}.`,
        reply,
        waited.stderr.trim(),
      ].filter(Boolean).join("\n\n"), { ...details, status: "failed" });
  }
}

export interface ToolRuntime {
  run: CliRunner;
  /** Polls at once, so that the panel shows the change. */
  refresh(): void;
  /** The agents of this lead from the last poll. */
  agents(): readonly ListedAgent[];
  agentTypes(): readonly AgentType[];
  /** The ids that a foreground Agent call waits for. The lead poll skips them. */
  foreground: Set<string>;
}

function leadId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

function writePromptFile(prompt: string): { file: string; cleanup(): void } | undefined {
  if (!prompt.trim()) return undefined;
  const dir = mkdtempSync(join(tmpdir(), "pi-tmux-agents-"));
  const file = join(dir, "system-prompt.md");
  writeFileSync(file, `${prompt.trim()}\n`);
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Registers Agent. Lead mode calls it again at session_start, with the types of the project. */
export function registerAgentTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  runtime: ToolRuntime,
  types: readonly AgentType[],
): void {
  pi.registerTool({
    name: "Agent",
    label: "Agent",
    description: agentToolDescription(types),
    parameters: AgentToolParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const available = runtime.agentTypes();
      const type = findAgentType(available, params.subagent_type);
      const description = params.description.replace(/\s+/g, " ").trim();
      if (!type) {
        return errorResult(
          `Unknown subagent_type "${params.subagent_type}". The agent types are: ${available.map((t) => t.name).join(", ") || "none"}.`,
          { action: "agent", description },
        );
      }
      if (params.isolation && params.isolation !== "worktree") {
        return errorResult(`isolation supports only "worktree", not "${params.isolation}".`, { action: "agent", description });
      }
      const name = params.name?.trim() || uniqueName(slugify(description), runtime.agents().map((agent) => agent.name));
      const promptFile = writePromptFile(type.prompt);
      let spawned: CliResult;
      try {
        spawned = await runtime.run(agentSpawnArgs(leadId(ctx), params, type, name, promptFile?.file), {
          signal,
          timeout: params.isolation === "worktree" ? ISOLATION_TIMEOUT_MS : CLI_TIMEOUT_MS,
          cwd: ctx.cwd,
        });
      } finally {
        promptFile?.cleanup();
      }
      if (spawned.code !== 0) {
        runtime.refresh();
        return failure("agent", name, spawned);
      }
      const id = spawned.stdout.trim();
      // A foreground call owns the events of its agent from here on.
      if (!params.run_in_background) runtime.foreground.add(id);
      runtime.refresh();
      const fields = trailerFields(spawned.stderr);
      const details: ToolDetails = {
        action: "agent", id, name, agentType: type.name, description, target: fields.target,
        ...(fields.worktree ? { worktree: fields.worktree, branch: fields.branch } : {}),
        background: params.run_in_background === true,
      };
      const notes = spawned.stderr.split("\n").filter((line) => line.trim() && !line.includes(`id=${id} `));
      const where = fields.worktree ? ` in the worktree ${fields.worktree} on branch ${fields.branch}` : "";
      if (params.run_in_background) {
        return ok([
          `Started agent "${name}" (${type.name}) id=${id} target=${fields.target ?? "?"}${where} in the background.`,
          "Its result arrives as a follow-up message. Do not poll.",
          ...notes,
        ].join("\n"), { ...details, status: "started" });
      }
      try {
        let waited: CliResult | undefined;
        try {
          waited = await runtime.run(["wait", id], { signal, cwd: ctx.cwd });
        } catch {
          // An aborted exec can reject instead of returning the killed child.
        }
        if (signal?.aborted || !waited) {
          const asked = await runtime.run(["interrupt", id], { timeout: CLI_TIMEOUT_MS, cwd: ctx.cwd })
            .catch(() => undefined);
          // Take the interrupted event here. From the lead poll, it would come
          // as a follow-up message that starts a new turn after the Esc.
          if (asked?.code === 0) {
            await runtime.run(["wait", id, "--timeout", String(ABORT_WAIT_S)], {
              timeout: (ABORT_WAIT_S + 5) * 1000, cwd: ctx.cwd,
            }).catch(() => undefined);
          }
          return ok(`Interrupted agent "${name}" (id ${id}). Continue it with SendMessage.`, {
            ...details, status: "interrupted",
          });
        }
        const result = foregroundResult(details, waited);
        const extra = [where ? `The agent works${where}.` : "", ...notes].filter(Boolean);
        if (extra.length > 0 && result.content[0]) result.content[0].text += `\n${extra.join("\n")}`;
        return result;
      } finally {
        runtime.foreground.delete(id);
        runtime.refresh();
      }
    },
    ...agentToolRenderers,
  });
}

export function registerTools(pi: Pick<ExtensionAPI, "registerTool">, runtime: ToolRuntime): void {
  const exec = (args: string[], ctx: ExtensionContext, signal?: AbortSignal) =>
    runtime.run(args, { signal, timeout: CLI_TIMEOUT_MS, cwd: ctx.cwd });
  const ref = (agent: string) => resolveAgentRef(agent, runtime.agents());

  registerAgentTool(pi, runtime, runtime.agentTypes());

  pi.registerTool({
    name: "SendMessage",
    label: "Send message",
    description: "Send a follow-up message to an agent that Agent started. Returns at once, and the result of the turn arrives as a follow-up message. Reopens a stopped agent on its pi session.",
    parameters: SendMessageParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(sendArgs(ref(params.to), params.message), ctx, signal);
      runtime.refresh();
      if (result.code !== 0) return failure("send", params.to, result);
      const fields = trailerFields(result.stderr);
      const reopened = result.stderr.includes("reopened");
      const text = reopened
        ? `Reopened agent ${params.to} on its pi session in ${fields.target ?? "?"}. The result arrives as a follow-up message.`
        : `The message is in the inbox of agent ${params.to}. The result arrives as a follow-up message.`;
      return ok(text, {
        action: "send", agent: params.to, id: fields.id, target: fields.target,
        status: reopened ? "reopened" : "queued",
      });
    },
    ...sendToolRenderers,
  });

  pi.registerTool({
    name: "ListAgents",
    label: "List agents",
    description: "List the agents of this session with their type and status.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const result = await exec(listArgs(leadId(ctx)), ctx, signal);
      if (result.code !== 0) return failure("list", undefined, result);
      const agents = parseList(result.stdout);
      const text = agents.length === 0
        ? "This session has no agents."
        : agents.map((agent) => [
          agent.id, agent.name, agent.agent_type || "-", agent.status, agent.target, agent.cwd,
          agent.description,
        ].join("\t")).join("\n");
      return ok(text, { action: "list", status: "listed", agents });
    },
    ...listToolRenderers,
  });

  pi.registerTool({
    name: "AgentRead",
    label: "Read agent",
    description: "Read the last lines of the tmux window of an agent. It only reads.",
    parameters: AgentReadParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(readArgs(ref(params.agent), params.lines), ctx, signal);
      if (result.code !== 0) return failure("read", params.agent, result);
      const screen = result.stdout.replace(/\n+$/, "");
      return ok(screen || "(The screen is empty.)", {
        action: "read", agent: params.agent, status: "read", screen,
      });
    },
    ...readToolRenderers,
  });

  pi.registerTool({
    name: "AgentInterrupt",
    label: "Interrupt agent",
    description: "Stop the current turn of an agent, or cancel its dialog. An interrupted result arrives as a follow-up message.",
    parameters: AgentRefParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(["interrupt", ref(params.agent)], ctx, signal);
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
    name: "AgentStop",
    label: "Stop agent",
    description: "Close the tmux window of an agent. Its folder and pi session stay, and SendMessage resumes it.",
    parameters: AgentRefParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await exec(["stop", ref(params.agent)], ctx, signal);
      runtime.refresh();
      if (result.code !== 0) return failure("stop", params.agent, result);
      return ok(`Stopped agent ${params.agent}. SendMessage resumes it.`, {
        action: "stop", agent: params.agent, status: "stopped",
      });
    },
    ...stopToolRenderers,
  });
}
