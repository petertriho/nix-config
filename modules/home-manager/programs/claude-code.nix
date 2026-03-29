{
  config,
  lib,
  ...
}:
let
  cfg = config.programs.claude-code;
in
{
  options.programs.claude-code.zai.enable =
    lib.mkEnableOption "Z.ai Anthropic-compatible endpoint for Claude Code";

  config = lib.mkMerge [
    (lib.mkIf (cfg.enable && cfg.zai.enable) {
      home.sessionVariables = {
        ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
        API_TIMEOUT_MS = "3000000";
        ANTHROPIC_DEFAULT_HAIKU_MODEL = "glm-5-turbo";
        ANTHROPIC_DEFAULT_SONNET_MODEL = "glm-4.7";
        ANTHROPIC_DEFAULT_OPUS_MODEL = "glm-5.1";
      };
    })
  ];
}
