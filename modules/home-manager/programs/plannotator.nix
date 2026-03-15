{
  config,
  lib,
  pkgs,
  ...
}:
{
  options.programs.plannotator = {
    enable = lib.mkEnableOption "plannotator opencode plugin";
  };

  config = lib.mkIf config.programs.plannotator.enable {
    xdg.configFile = {
      "opencode/commands/plannotator-annotate.md".source =
        "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands/plannotator-annotate.md";
      "opencode/commands/plannotator-review.md".source =
        "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands/plannotator-review.md";
    };
    programs.opencode.settings.plugin = [ "@plannotator/opencode" ];
  };
}
