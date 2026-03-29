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

  config = lib.mkIf config.programs.superpowers.enable (lib.mkMerge [
    (lib.mkIf config.programs.opencode.enable {
      xdg.configFile = {
        "opencode/plugins/superpowers.js".source =
          "${pkgs.superpowers}/share/superpowers/.opencode/plugins/superpowers.js";
        "opencode/skills/superpowers".source = "${pkgs.superpowers}/share/superpowers/skills";
      };
    })
    (lib.mkIf config.programs.claude-code.enable {
      programs.claude-code.plugins = lib.mkAfter [
        "${pkgs.superpowers}/share/superpowers"
      ];
    })
  ]);
}
