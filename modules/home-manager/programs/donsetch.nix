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
    # Pi defaults server exposure to codemode. Directly expose only the two
    # high-signal tools. web_crawl and web_screenshot stay on codemode.
    programs.ai.mcp.donsetch = {
      command = lib.getExe' cfg.package "donsetch";
      args = [
        "mcp"
        "--supervised"
      ];
      toolExposure = {
        web_fetch = "direct";
        web_search = "direct";
      };
    };
  };
}
