{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.elephant-goldfish-model;
  share = "${pkgs.elephant-goldfish-model}/share/elephant-goldfish-model";
in
{
  options.programs.elephant-goldfish-model.enable = lib.mkEnableOption "Elephant-Goldfish Model design and review plugin";

  config = lib.mkIf cfg.enable {
    programs.ai.skills.elephant-goldfish-model = {
      source = "${share}/skills";
      clients = {
        # The skills read agents/, resources/, and docs/ from the plugin root,
        # so Claude Code loads the whole plugin instead of the bare skills.
        "claude-code" = {
          enable = false;
          pluginPaths = [ share ];
        };

        # Upstream supports only whole-plugin installs. These clients would
        # get skills without their personas and standards.
        codex.enable = false;
        opencode.enable = false;
        pi.enable = false;
      };
    };
  };
}
