{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.annot;
in
{
  options.programs.annot = {
    enable = lib.mkEnableOption "annot human-in-the-loop annotation MCP server";
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ pkgs.llm-agents.annot ];
    programs.mcp.servers.annot = {
      command = "annot";
      args = [ "mcp" ];
      disabled = false;
    };
  };
}
