{
  config,
  lib,
  pkgs,
  ...
}:
let
  plannotator = pkgs.llm-agents.plannotator;
  plannotatorSource = plannotator.src;
in
{
  options.programs.plannotator = {
    enable = lib.mkEnableOption "plannotator opencode plugin";
  };

  config = lib.mkIf config.programs.plannotator.enable (
    lib.mkMerge [
      { home.packages = [ plannotator ]; }
      {
        # Drafts, version history, and the feedback archive live in
        # ~/.plannotator. The nono Claude and Pi profiles need it writable
        # for their `peter` workflow gates.
        programs.nono.agentFilesystem.claude.allow = [ "$HOME/.plannotator" ];
        programs.nono.agentFilesystem.pi.allow = [ "$HOME/.plannotator" ];
      }
    #   {
    #     programs.ai.skills.plannotator-compound = {
    #       source = "${plannotatorSource}/apps/skills/extra/plannotator-compound";
    #       clients = {
    #         opencode = {
    #           pluginEntries = [ "@plannotator/opencode" ];
    #           files = lib.mapAttrs' (
    #             name: _:
    #             lib.nameValuePair "opencode/commands/${name}" {
    #               source = "${plannotatorSource}/apps/opencode-plugin/commands/${name}";
    #             }
    #           ) (builtins.readDir "${plannotatorSource}/apps/opencode-plugin/commands");
    #         };
    #         "claude-code" = {
    #           enable = false;
    #           pluginPaths = [
    #             "${plannotatorSource}/apps/hook"
    #           ];
    #         };
    #       };
    #     };
    #   }
      (lib.mkIf config.programs.opencode.enable {
        home.sessionVariables.PLANNOTATOR_ALLOW_SUBAGENTS = "1";
      })
    ]
  );
}
