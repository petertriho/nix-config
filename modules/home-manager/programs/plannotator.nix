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

  config = lib.mkIf config.programs.plannotator.enable (
    lib.mkMerge [
      { home.packages = [ pkgs.plannotator ]; }
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile = {
          "opencode/skills/plannotator-compound".source =
            "${pkgs.plannotator}/share/plannotator/apps/skills/plannotator-compound";
        }
        // lib.mapAttrs' (
          name: _:
          lib.nameValuePair "opencode/commands/${name}" {
            source = "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands/${name}";
          }
        ) (builtins.readDir "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands");
        programs.opencode.settings.plugin = [ "@plannotator/opencode" ];
        home.sessionVariables.PLANNOTATOR_ALLOW_SUBAGENTS = "1";
      })
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.plugins = [
          "${pkgs.plannotator}/share/plannotator/apps/hook"
        ];
      })
    ]
  );
}
