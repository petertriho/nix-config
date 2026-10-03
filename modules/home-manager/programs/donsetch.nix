{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.donsetch;
  chromiumPackage =
    if config.programs.chromium.enable then
      config.programs.chromium.package
    else
      pkgs.ungoogled-chromium;
  browserEnv = {
    DONSETCH_BROWSER__BACKEND = "chromium";
    DONSETCH_BROWSER__CHROMIUM_PATH = cfg.browserPath;
  };
in
{
  options.programs.donsetch = {
    enable = lib.mkEnableOption "donsetch web fetch/search/crawl MCP server";

    package = lib.mkPackageOption pkgs "donsetch" { };

    browserPath = lib.mkOption {
      type = lib.types.str;
      default =
        if pkgs.stdenv.hostPlatform.isDarwin then
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        else
          lib.getExe' chromiumPackage "chromium";
      description = ''
        Chromium or Chrome executable for browser-backed fetches. Use the
        Nix wrapper on Linux, not the unwrapped binary. On macOS, the default
        uses Google Chrome installed in /Applications.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    home.sessionVariables = browserEnv;

    # Rendered to the shared XDG MCP file and each client's native MCP config.
    # Pi defaults server exposure to codemode. Directly expose only the two
    # high-signal tools. web_crawl and web_screenshot stay on codemode.
    programs.ai.mcp.donsetch = {
      command = lib.getExe' cfg.package "donsetch";
      args = [
        "mcp"
        "--supervised"
      ];
      # Explicit paths avoid incompatible cached browsers and unwrapped Nix binaries.
      env = browserEnv;
      toolExposure = {
        web_fetch = "direct";
        web_search = "direct";
      };
    };
  };
}
