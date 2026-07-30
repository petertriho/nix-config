{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.workmux;
in
{
  options.programs.workmux = {
    enable = lib.mkEnableOption "workmux";
    package = lib.mkPackageOption pkgs.llm-agents "workmux" {
      pkgsText = "pkgs.llm-agents";
    };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        home.packages = [ cfg.package ];
        xdg.configFile."workmux/config.yaml".source =
          config.lib.meta.mkDotfilesSymlink "workmux/.config/workmux/config.yaml";
      }
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile."opencode/plugins/workmux-status.ts".source =
          "${cfg.package.src}/resources/opencode/plugins/workmux-status.ts";
      })
      (lib.mkIf config.programs.pi-coding-agent.enable {
        home.file."${config.programs.pi-coding-agent.configDir}/extensions/workmux-status.ts".source =
          "${cfg.package.src}/.pi/extensions/workmux-status.ts";
      })
    ]
  );
}
