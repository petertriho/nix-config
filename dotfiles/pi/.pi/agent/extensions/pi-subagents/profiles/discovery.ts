import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentDefaultsLike as AgentDefaults, LaunchBehavior } from "../execution/services.ts";
import type { SubagentParamsType } from "../registration/schemas.ts";

type SubagentSessionMode = LaunchBehavior["sessionMode"];
export type AgentSource = "package" | "global" | "project";

export interface AgentDefinition extends AgentDefaults {
  name: string;
  description?: string;
  disableModelInvocation: boolean;
}

export interface ListedAgentDefinition extends AgentDefinition {
  source: AgentSource;
  /** File basename — the identifier `agent:` spawns resolve against. */
  fileName: string;
}

export function getAgentConfigDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  return value == null ? undefined : value === "true";
}

function parseSessionMode(value: string | undefined): SubagentSessionMode | undefined {
  if (value === "standalone" || value === "lineage-only" || value === "fork") {
    return value;
  }
  return undefined;
}

export function parseAgentDefinition(content: string, fallbackName: string): AgentDefinition | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  const systemPromptMode = getFrontmatterValue(frontmatter, "system-prompt");

  return {
    name: getFrontmatterValue(frontmatter, "name") ?? fallbackName,
    description: getFrontmatterValue(frontmatter, "description"),
    model: getFrontmatterValue(frontmatter, "model"),
    tools: getFrontmatterValue(frontmatter, "tools"),
    systemPromptMode:
      systemPromptMode === "replace"
        ? "replace"
        : systemPromptMode === "append"
          ? "append"
          : undefined,
    skills: getFrontmatterValue(frontmatter, "skill") ?? getFrontmatterValue(frontmatter, "skills"),
    thinking: getFrontmatterValue(frontmatter, "thinking"),
    denyTools: getFrontmatterValue(frontmatter, "deny-tools"),
    spawning: parseOptionalBoolean(getFrontmatterValue(frontmatter, "spawning")),
    autoExit: parseOptionalBoolean(getFrontmatterValue(frontmatter, "auto-exit")),
    interactive: parseOptionalBoolean(getFrontmatterValue(frontmatter, "interactive")),
    sessionMode: parseSessionMode(getFrontmatterValue(frontmatter, "session-mode")),
    cwd: getFrontmatterValue(frontmatter, "cwd"),
    cli: getFrontmatterValue(frontmatter, "cli"),
    body: body || undefined,
    disableModelInvocation:
      getFrontmatterValue(frontmatter, "disable-model-invocation")?.toLowerCase() === "true",
  };
}

/** Keep bundled resources anchored to the extension entry, not this module. */
export function createAgentDiscovery(subagentsDir: string) {
  function getBundledAgentsDir(): string {
    return join(subagentsDir, "agents");
  }

  function discoverAgentDefinitions(): ListedAgentDefinition[] {
    const agents = new Map<string, ListedAgentDefinition>();
    const dirs: Array<{ path: string; source: AgentSource }> = [
      { path: getBundledAgentsDir(), source: "package" },
      { path: join(getAgentConfigDir(), "agents"), source: "global" },
      { path: join(process.cwd(), ".pi", "agents"), source: "project" },
    ];

    for (const { path: dir, source } of dirs) {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
        const parsed = parseAgentDefinition(
          readFileSync(join(dir, file), "utf8"),
          file.replace(/\.md$/, ""),
        );
        if (!parsed) continue;
        const fileName = file.replace(/\.md$/, "");
        agents.set(fileName, { ...parsed, fileName, source });
      }
    }

    return [...agents.values()];
  }

  function resolveSubagentPaths(
    params: SubagentParamsType,
    agentDefs: AgentDefaults | null,
  ): { effectiveCwd: string | null; localAgentDir: string | null; effectiveAgentDir: string } {
    const rawCwd = params.cwd ?? agentDefs?.cwd ?? null;
    const cwdIsFromAgent = !params.cwd && agentDefs?.cwd != null;
    const cwdBase = cwdIsFromAgent ? getAgentConfigDir() : process.cwd();
    const effectiveCwd = rawCwd
      ? rawCwd.startsWith("/")
        ? rawCwd
        : join(cwdBase, rawCwd)
      : null;
    const localAgentDir = effectiveCwd ? join(effectiveCwd, ".pi", "agent") : null;
    const effectiveAgentDir =
      localAgentDir && existsSync(localAgentDir) ? localAgentDir : getAgentConfigDir();
    return { effectiveCwd, localAgentDir, effectiveAgentDir };
  }

  function loadAgentDefaults(agentName: string): AgentDefaults | null {
    const configDir = getAgentConfigDir();
    const paths = [
      join(process.cwd(), ".pi", "agents", `${agentName}.md`),
      join(configDir, "agents", `${agentName}.md`),
      join(getBundledAgentsDir(), `${agentName}.md`),
    ];

    for (const p of paths) {
      if (!existsSync(p)) continue;
      const parsed = parseAgentDefinition(readFileSync(p, "utf8"), agentName);
      if (parsed) return parsed;
    }

    return null;
  }
  return { getAgentConfigDir, getBundledAgentsDir, parseAgentDefinition,
    discoverAgentDefinitions, resolveSubagentPaths, loadAgentDefaults };
}
export type AgentDiscovery = ReturnType<typeof createAgentDiscovery>;
