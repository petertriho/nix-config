{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.elephant-goldfish-model;
  pkg = pkgs.elephant-goldfish-model;
  share = "${pkg}/share/elephant-goldfish-model";
in
{
  options.programs.elephant-goldfish-model.enable = lib.mkEnableOption "Elephant-Goldfish Model design and review plugin";

  config = lib.mkIf cfg.enable {
    programs.ai.skills.elephant-goldfish-model = {
      source = "${share}/skills";
      clients = {
        # The skills read agents/, resources/, and docs/ from the plugin root,
        # so Claude Code loads the whole plugin instead of the bare skills.
        # Claude Code loads a skills folder with `.claude-plugin/` as a
        # plugin. Do not use `pluginPaths`: its wrapper links each top-level
        # entry separately, so the agent paths in `plugin.json` resolve
        # outside the plugin folder and Claude Code drops every agent.
        "claude-code".source = share;

        # Upstream supports only whole-plugin installs. These clients would
        # get skills without their personas and standards.
        codex.enable = false;
        opencode.enable = false;
        pi.enable = false;
      };
    };

    # The package generates the agents that EGM skills define at runtime.
    # See pkgs/elephant-goldfish-model/claude-agents.py.
    programs.claude-code.agents = lib.genAttrs pkg.claudeRuntimeAgents (
      name: "${pkg}/share/claude-agents/${name}.md"
    );
  };
}
