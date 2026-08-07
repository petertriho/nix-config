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
    # CLI on PATH.
    home.packages = [ cfg.package ];

    # Packaged discovery skill, rendered into claude-code, opencode, and pi by
    # the programs.ai machinery (each gated on programs.<client>.enable).
    # Codex is intentionally excluded.
    programs.ai.skills.agent-browser = {
      source = "${cfg.package}/share/agent-browser/skills/agent-browser";
      clients.codex.enable = false;
    };

    # Browser selection is handled entirely by the package, so nothing here is
    # platform-specific:
    #   Linux → package-wrapped nixpkgs chromium (AGENT_BROWSER_EXECUTABLE_PATH).
    #   macOS → auto-detected system Google Chrome; run `agent-browser install`
    #           once to fetch Chrome for Testing if Chrome is absent.
  };
}
