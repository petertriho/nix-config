{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.agent-browser;
in
{
  options.programs.agent-browser = {
    enable = lib.mkEnableOption "agent-browser";

    package = lib.mkPackageOption pkgs.llm-agents "agent-browser" {
      pkgsText = "pkgs.llm-agents";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    programs.ai.skills.agent-browser = {
      source = "${cfg.package}/share/agent-browser/skills/agent-browser";
      clients.codex.enable = false;
      clients.claude-code.enable = false; # use claude's browser extension
    };
  };
}
