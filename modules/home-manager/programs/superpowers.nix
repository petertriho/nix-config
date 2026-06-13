{
  config,
  lib,
  pkgs,
  ...
}:
{
  options.programs.superpowers = {
    enable = lib.mkEnableOption "superpowers skills";
  };

  config = lib.mkIf config.programs.superpowers.enable {
    programs.ai.resources = {
      skills.superpowers = {
        source = "${pkgs.superpowers}/share/superpowers/skills";
        clients.claude-code.enable = false;
      };
      opencodePlugins = [
        {
          files."opencode/plugins/superpowers.js".source =
            "${pkgs.superpowers}/share/superpowers/.opencode/plugins/superpowers.js";
        }
      ];
      claudePlugins = lib.mkAfter [
        "${pkgs.superpowers}/share/superpowers"
      ];
    };
  };
}
