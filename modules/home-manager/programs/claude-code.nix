{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.claude-code;
in
{
  config = lib.mkIf cfg.enable {
    home = {
      # file.".claude/skills/context7" = {
      #   source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/context7";
      # };
      file.".claude/settings.json".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/settings.json";
      sessionVariables = {
        CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = 1;
        CLAUDE_CODE_DISABLE_AUTO_MEMORY = 1;
        CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = 1;
        CLAUDE_CODE_NO_FLICKER = 1;
        ENABLE_CLAUDEAI_MCP_SERVERS = "false";
      };
      packages = [ pkgs.llm-agents.ccstatusline ];
    };
    xdg.configFile."ccstatusline/settings.json".source =
      config.lib.meta.mkDotfilesSymlink "ccstatusline/.config/ccstatusline/settings.json";
  };
}
