import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { createAgentModelManager } from "../profiles/model-manager.ts";

export function registerCommands(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  manageAgentModels: ReturnType<typeof createAgentModelManager>
): void {
  const { loadAgentDefaults } = discovery;
  pi.registerCommand("subtask", {
    description: "Fork session into a subagent for focused work (bugfixes, iteration)",
    handler: async (args) => {
      const task = args.trim() || "";
      const taskText = task || "The user wants to do some hands-on work. Help them with whatever they need.";
      const toolCall =
        `Use Agent to fork a session. fork: true, description: "Subtask", prompt: ${JSON.stringify(taskText)}. ` +
        "Do not set name, subagent_type, tools, skills, or model.";
      pi.sendUserMessage(toolCall);
    },
  });

  pi.registerCommand("subagent", {
    description: "Spawn a subagent: /subagent <agent> <task>",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        ctx.ui.notify("Usage: /subagent <agent> [task]", "warning");
        return;
      }

      const spaceIdx = trimmed.indexOf(" ");
      const agentName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const task = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

      const defs = loadAgentDefaults(agentName);
      if (!defs) {
        ctx.ui.notify(
          `Agent "${agentName}" not found in the bundled agents, ~/.pi/agent/agents/, or .pi/agents/`,
          "error",
        );
        return;
      }

      const taskText = task || `You are the ${agentName} agent. Wait for instructions.`;
      const displayName = agentName[0].toUpperCase() + agentName.slice(1);
      const toolCall = `Use Agent with description: ${JSON.stringify(`${agentName}: ${taskText}`)}, ` +
        `subagent_type: ${JSON.stringify(agentName)}, name: ${JSON.stringify(displayName)}, ` +
        `prompt: ${JSON.stringify(taskText)}`;
      pi.sendUserMessage(toolCall);
    },
  });

  pi.registerCommand("agent-models", {
    description: "Set or clear per-agent default models (agent-models.json)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/agent-models needs interactive UI.", "warning");
        return;
      }
      await manageAgentModels(ctx);
    },
  });
}
