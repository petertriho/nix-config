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
  options.programs.claude-code.zai.enable =
    lib.mkEnableOption "Z.ai Anthropic-compatible endpoint for Claude Code";

  config = lib.mkMerge [
    (lib.mkIf cfg.enable {
      home = {
        file.".claude/skills/context7" = {
          source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/context7";
        };
        sessionVariables = {
          # CLAUDE_CODE_DISABLE_AUTO_MEMORY = 1;
          CLAUDE_CODE_NO_FLICKER = 1;
          ENABLE_CLAUDEAI_MCP_SERVERS = "false";
        };
        packages = [ pkgs.llm-agents.ccstatusline ];
      };
      xdg.configFile."ccstatusline/settings.json".source =
        config.lib.meta.mkDotfilesSymlink "ccstatusline/.config/ccstatusline/settings.json";
    })
    (lib.mkIf (cfg.enable && cfg.zai.enable) {
      home.sessionVariables = {
        ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
        API_TIMEOUT_MS = "3000000";
        ANTHROPIC_DEFAULT_HAIKU_MODEL = "glm-5-turbo";
        ANTHROPIC_DEFAULT_SONNET_MODEL = "glm-5.1";
        ANTHROPIC_DEFAULT_OPUS_MODEL = "glm-4.7";
      };
    })
  ];
}
