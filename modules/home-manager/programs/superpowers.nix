{
  config,
  lib,
  pkgs,
  ...
}:
{
  options.programs.superpowers = {
    enable = lib.mkEnableOption "superpowers skills for opencode";
  };

  config = lib.mkIf config.programs.superpowers.enable {
    xdg.configFile = {
      "opencode/plugins/superpowers.js".source =
        "${pkgs.superpowers}/share/superpowers/.opencode/plugins/superpowers.js";
      "opencode/skills/superpowers".source = "${pkgs.superpowers}/share/superpowers/skills";
    };
  };
}
