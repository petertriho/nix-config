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
      {
        programs.ai.resources = {
          skills.plannotator-compound = {
            source = "${pkgs.plannotator}/share/plannotator/apps/skills/plannotator-compound";
            clients.claude-code.enable = false;
          };
          opencodePlugins = [ { entry = "@plannotator/opencode"; } ];
          claudePlugins = [
            "${pkgs.plannotator}/share/plannotator/apps/hook"
          ];
        };
      }
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile = lib.mapAttrs' (
          name: _:
          lib.nameValuePair "opencode/commands/${name}" {
            source = "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands/${name}";
          }
        ) (builtins.readDir "${pkgs.plannotator}/share/plannotator/apps/opencode-plugin/commands");
        home.sessionVariables.PLANNOTATOR_ALLOW_SUBAGENTS = "1";
      })
    ]
  );
}
