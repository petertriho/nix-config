{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.context-mode;
  packageRoot = "${cfg.package}/lib/node_modules/context-mode";
  disabledClaudePlugin = pkgs.runCommand "claude-code-context-mode-disabled-plugin" { } ''
    install -Dm644 ${
      pkgs.writeText "context-mode-disabled-plugin.json" (
        builtins.toJSON {
          name = "context-mode";
          version = "0.0.0-disabled";
          description = "No-op placeholder for disabled context-mode.";
        }
      )
    } $out/.claude-plugin/plugin.json
    install -Dm644 ${
      pkgs.writeText "context-mode-disabled-marketplace.json" (
        builtins.toJSON {
          name = "context-mode";
          owner.name = "Nix";
          metadata = {
            description = "Disabled context-mode placeholder.";
            version = "0.0.0-disabled";
          };
          plugins = [
            {
              name = "context-mode";
              source = "./";
              description = "No-op placeholder for disabled context-mode.";
              version = "0.0.0-disabled";
              category = "development";
            }
          ];
        }
      )
    } $out/.claude-plugin/marketplace.json
  '';
in
{
  options.programs.context-mode = {
    enable = lib.mkEnableOption "context-mode integration for AI coding agents";
    package = lib.mkPackageOption pkgs "context-mode" { };
  };

  config = lib.mkMerge [
    (lib.mkIf cfg.enable (
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
    ))
    (lib.mkIf (!cfg.enable && config.programs.claude-code.enable) {
      programs.claude-code.plugins = lib.mkAfter [ disabledClaudePlugin ];
    })
  ];
}
