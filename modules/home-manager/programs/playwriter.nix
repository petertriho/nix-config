{
  config,
  lib,
  pkgs,
  ...
}:
{
  options.programs.playwriter = {
    enable = lib.mkEnableOption "playwriter browser automation";
  };

  config = lib.mkIf config.programs.playwriter.enable (
    lib.mkMerge [
      {
        home.packages = [ pkgs.playwriter ];
        programs.mcp.servers.playwriter = {
          command = "playwriter";
          args = [ ];
          disabled = false;
        };
      }
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile = {
          "opencode/skills/playwriter".source = "${pkgs.playwriter}/share/playwriter/skills/playwriter";
        };
      })
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.skills = {
          playwriter = "${pkgs.playwriter}/share/playwriter/skills/playwriter";
        };
      })
      (lib.mkIf config.programs.codex.enable {
        programs.codex.skills = {
          playwriter = "${pkgs.playwriter}/share/playwriter/skills/playwriter";
        };
      })
    ]
  );
}
