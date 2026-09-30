{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.donsetch;
in
{
  options.programs.donsetch = {
    enable = lib.mkEnableOption "donsetch web fetch/search/crawl MCP server";

    package = lib.mkPackageOption pkgs "donsetch" { };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # Rendered to the shared XDG MCP file and each client's native MCP config.
    programs.ai.mcp.donsetch = {
      command = lib.getExe' cfg.package "donsetch";
      args = [
        "mcp"
        "--supervised"
      ];
    };
  };
}
