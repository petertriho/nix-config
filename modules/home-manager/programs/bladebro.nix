{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.bladebro;
in
{
  options.programs.bladebro = {
    enable = lib.mkEnableOption "bladebro agentic browser MCP server";

    package = lib.mkPackageOption pkgs "bladebro" { };

    debugPort = lib.mkOption {
      type = lib.types.nullOr lib.types.port;
      # Linux: connect to the visible Chromium that bladebro-chrome launches.
      # macOS: null — bladebro opens a visible Chrome window natively.
      default = if pkgs.stdenv.hostPlatform.isLinux then 9222 else null;
      description = ''
        Connect bladebro to an already-running visible Chromium's CDP
        debug port instead of auto-launching its own browser. Launch the
        browser with the bladebro-chrome script. Set to null to let bladebro
        auto-launch (its default behavior outside Linux).
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # Rendered for every MCP-integrated client: the shared
    # ~/.config/mcp/mcp.json (pi-mcp-adapter), opencode, and Claude Code.
    # With debugPort set, bladebro connects to the visible Chromium that
    # bladebro-chrome launched; otherwise it launches its own (headless on
    # Linux, visible on macOS) auto-detected from PATH (CHROME_PATH).
    programs.ai.mcp.bladebro = {
      command = lib.getExe' cfg.package "bladebro";
      args = [ "mcp" ] ++ lib.optionals (cfg.debugPort != null) [
        "--port"
        (toString cfg.debugPort)
      ];
    };
  };
}
