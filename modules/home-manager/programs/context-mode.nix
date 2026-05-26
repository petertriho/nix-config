{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.programs.context-mode;
  packageRoot = "${cfg.package}/lib/node_modules/context-mode";
in
{
  options.programs.context-mode = {
    enable = lib.mkEnableOption "context-mode integration for AI coding agents";
    package = lib.mkPackageOption pkgs "context-mode" { };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        home.packages = [ cfg.package ];
      }
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile."opencode/node_modules/context-mode".source = packageRoot;
        programs.opencode.settings.plugin = lib.mkAfter [ "context-mode" ];
      })
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.plugins = lib.mkAfter [ packageRoot ];
      })
    ]
  );
}
