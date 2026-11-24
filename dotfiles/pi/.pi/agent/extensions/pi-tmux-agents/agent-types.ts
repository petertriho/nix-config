import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** An agent definition: the value of the `subagent_type` parameter of Agent. */
export interface AgentType {
  name: string;
  description: string;
  /** The pi tool allowlist, comma-separated, or undefined for the pi default tools. */
  tools?: string;
  model?: string;
  thinking?: string;
  /** Close the window after each stop result. SendMessage reopens it. */
  autoStop: boolean;
  /** Appended to the system prompt of the agent. */
  prompt: string;
  source: "bundled" | "project";
  path: string;
}

export const BUNDLED_AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "agents");
export const DEFAULT_AGENT_TYPE = "general-purpose";

/** A name that the CLI can record and the model can type. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value);
  return match ? match[2] : value;
}

/**
 * Parses one definition file. The frontmatter holds one `key: value` pair on
 * each line, as in the pi-subagents agent files. A file without a valid name
 * or description gives no type.
 */
export function parseAgentType(content: string, path: string, source: AgentType["source"]): AgentType | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(content);
  if (!match) return undefined;
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (field) fields.set(field[1].toLowerCase(), unquote(field[2].trim()));
  }
  const name = fields.get("name") ?? "";
  const description = (fields.get("description") ?? "").replace(/\s+/g, " ").trim();
  if (!NAME_PATTERN.test(name) || !description) return undefined;
  const tools = (fields.get("tools") ?? "").split(/[\s,]+/).filter(Boolean).join(",");
  return {
    name,
    description,
    ...(tools ? { tools } : {}),
    ...(fields.get("model") ? { model: fields.get("model") } : {}),
    ...(fields.get("thinking") ? { thinking: fields.get("thinking") } : {}),
    autoStop: fields.get("auto-stop") === "true",
    prompt: (match[2] ?? "").trim(),
    source,
    path,
  };
}

function readTypes(dir: string, source: AgentType["source"]): AgentType[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const types: AgentType[] = [];
  for (const file of names.sort()) {
    if (!file.endsWith(".md")) continue;
    const path = join(dir, file);
    try {
      const type = parseAgentType(readFileSync(path, "utf8"), path, source);
      if (type) types.push(type);
    } catch {
      // An unreadable file gives no type, as a file without a name does.
    }
  }
  return types;
}

export interface DiscoverOptions {
  /** The folder of the lead session. Its `.pi/agents/` holds the project types. */
  cwd?: string;
  /** Project types load only in a project that pi trusts. */
  trusted?: boolean;
  bundledDir?: string;
}

/** The bundled types, then the project types. A project type replaces a bundled type with its name. */
export function discoverAgentTypes(options: DiscoverOptions = {}): AgentType[] {
  const types = new Map<string, AgentType>();
  for (const type of readTypes(options.bundledDir ?? BUNDLED_AGENTS_DIR, "bundled")) types.set(type.name, type);
  if (options.cwd && options.trusted) {
    for (const type of readTypes(join(options.cwd, ".pi", "agents"), "project")) types.set(type.name, type);
  }
  return [...types.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findAgentType(types: readonly AgentType[], name: string | undefined): AgentType | undefined {
  const wanted = name?.trim() || DEFAULT_AGENT_TYPE;
  return types.find((type) => type.name === wanted)
    ?? types.find((type) => type.name.toLowerCase() === wanted.toLowerCase());
}

/** One line for each type, for the description of the Agent tool. */
export function describeAgentTypes(types: readonly AgentType[]): string {
  if (types.length === 0) return "No agent types are available.";
  return types.map((type) => {
    const notes = [
      type.tools ? `tools: ${type.tools.replace(/,/g, ", ")}` : "",
      type.autoStop ? "the window closes after the result" : "",
      type.source === "project" ? "project" : "",
    ].filter(Boolean);
    return `- ${type.name}: ${type.description}${notes.length ? ` (${notes.join("; ")})` : ""}`;
  }).join("\n");
}
