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
      "opencode/skills/plannotator-compound".source =
        "${pkgs.plannotator}/share/plannotator/skills/plannotator-compound";
    }
    // lib.mapAttrs' (
      name: _:
      lib.nameValuePair "opencode/commands/${name}" {
        source = "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands/${name}";
      }
    ) (builtins.readDir "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands");
    programs.opencode.settings.plugin = [ "@plannotator/opencode" ];
    home.sessionVariables.PLANNOTATOR_ALLOW_SUBAGENTS = "1";
  };
}
