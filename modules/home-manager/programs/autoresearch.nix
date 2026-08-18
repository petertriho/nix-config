{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.autoresearch;
  share = "${pkgs.autoresearch}/share/autoresearch";
  commandFiles = builtins.readDir "${share}/opencode/commands";
in
{
  options.programs.autoresearch.enable =
    lib.mkEnableOption "autoresearch autonomous iteration plugin";

  config = lib.mkIf cfg.enable {
    programs.ai.skills.autoresearch = {
      source = "${share}/opencode/skills/autoresearch";
      clients = {
        # `files` rather than `commands`: ai.nix types commands as
        # `either lines path`, and a store-path string matches `lines` first,
        # which would inline the path as the command body.
        opencode.files = lib.mapAttrs' (
          name: _:
          lib.nameValuePair "opencode/commands/${name}" {
            source = "${share}/opencode/commands/${name}";
          }
        ) commandFiles;

        # The plugin carries its own copy of the skill alongside the 14
        # commands; rendering the skill separately would duplicate it.
        "claude-code" = {
          enable = false;
          pluginPaths = [ "${share}/claude-plugin" ];
        };

        codex.enable = false;
        pi.enable = false;
      };
    };
  };
}
