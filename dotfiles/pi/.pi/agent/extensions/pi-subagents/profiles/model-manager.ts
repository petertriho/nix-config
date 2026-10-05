import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AGENT_MODELS_VERSION, agentModelsPath, readAgentModelConfig, writeAgentModelConfig } from "./agent-models.ts";
import { parseExplicitModelSelection, pickModelSelection } from "./model-picker.ts";
import type { AgentDiscovery, ListedAgentDefinition } from "./discovery.ts";

export function createAgentModelManager(discoverAgentDefinitions: AgentDiscovery["discoverAgentDefinitions"]) {
  type AgentModelsContext = Pick<
    ExtensionContext,
    "hasUI" | "ui" | "scopedModels" | "modelRegistry" | "model" | "thinkingLevel"
  >;

  function agentModelsListLabel(def: ListedAgentDefinition, agents: Record<string, string>): string {
    // Config entries are keyed by the filename-based identifier the spawn path
    // looks up (`agents[params.agent]`), never the frontmatter `name:`, so a
    // default set here always matches the spawn that should use it.
    const id = def.fileName;
    const display = def.name === id ? "" : ` (${def.name})`;
    const configured = agents[id];
    const base = `${id}${display} — ${configured ?? "parent default"}`;
    if (def.cli) return `${base} · frontmatter only`;
    return base;
  }

  /**
   * Interactive manager behind `/agent-models`: list every discovered agent
   * with its configured default (or "parent default"), then set or clear one
   * entry at a time. Every change is validated against the registry and saved
   * immediately through the atomic write, so the on-disk config is always the
   * source of truth. Manifest workflow launches resolve models through their
   * persisted workflow policy and never consult this ad-hoc spawn config.
   * `cli:` agents keep their frontmatter model and offer no edits here.
   */
  async function manageAgentModels(ctx: AgentModelsContext): Promise<void> {
    const done = "Done";
    while (true) {
      const read = readAgentModelConfig();
      if (read.status === "invalid") {
        ctx.ui.notify(
          `${read.error} Fix or remove the file before editing agent defaults here.`,
          "error",
        );
        return;
      }
      const agents = read.status === "ok" ? read.config.agents : {};
      const defs = discoverAgentDefinitions().sort((first, second) => first.fileName.localeCompare(second.fileName));
      const byLabel = new Map(defs.map((def) => [agentModelsListLabel(def, agents), def]));

      const choice = await ctx.ui.select(
        "Select an agent to configure its default model",
        [...byLabel.keys(), done],
      );
      if (choice === undefined || choice === done) return;
      const def = byLabel.get(choice);
      if (!def) return;
      const id = def.fileName;

      if (def.cli) {
        await ctx.ui.select(`${id} keeps its frontmatter model (cli agent)`, ["Back"]);
        continue;
      }

      const current = agents[id];
      const action = await ctx.ui.select(
        `${id} — ${current ?? "parent default"}`,
        ["Set model", ...(current ? ["Clear"] : []), "Back"],
      );
      if (action === "Set model") {
        let picked: Awaited<ReturnType<typeof pickModelSelection>>;
        try {
          picked = await pickModelSelection(ctx, {
            title: `Default model for ${id}`,
            subject: id,
            ...(current ? { currentRef: current } : {}),
          });
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
          continue;
        }
        if (!picked) continue;
        const next = { ...agents, [id]: picked.argument };
        try {
          parseExplicitModelSelection(picked.argument, ctx.modelRegistry.getAvailable());
          writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: next });
          ctx.ui.notify(`Default model for ${id}: ${picked.argument}`, "info");
        } catch (error) {
          ctx.ui.notify(
            `Failed to save the default model for ${id}: `
            + `${error instanceof Error ? error.message : String(error)} `
            + `${agentModelsPath()} must be a real writable file `
            + "(not a read-only symlink, e.g. from home-manager).",
            "error",
          );
        }
      } else if (action === "Clear") {
        const next = { ...agents };
        delete next[id];
        try {
          writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: next });
          ctx.ui.notify(
            `Cleared the default model for ${id}; it now uses the parent default.`,
            "info",
          );
        } catch (error) {
          ctx.ui.notify(
            `Failed to clear the default model for ${id}: `
            + `${error instanceof Error ? error.message : String(error)} `
            + `${agentModelsPath()} must be a real writable file `
            + "(not a read-only symlink, e.g. from home-manager).",
            "error",
          );
        }
      }
    }
  }
  return manageAgentModels;
}
