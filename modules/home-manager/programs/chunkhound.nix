{
  config,
  lib,
  pkgs,
  ...
}:
{
  options.programs.chunkhound = {
    enable = lib.mkEnableOption "chunkhound code intelligence";
  };

  config = lib.mkIf config.programs.chunkhound.enable {
    home = {
      packages = [ pkgs.chunkhound ];
      sessionVariables = {
        CHUNKHOUND_LLM_PROVIDER = "opencode-cli";
        CHUNKHOUND_LLM_UTILITY_MODEL = "github-copilot/gpt-5-mini";
        CHUNKHOUND_LLM_SYNTHESIS_MODEL = "openai/gpt-5.4";
        CHUNKHOUND_EMBEDDING__PROVIDER = "openai";
        CHUNKHOUND_EMBEDDING__BASE_URL = "https://chutes-qwen-qwen3-embedding-8b.chutes.ai/v1";
        CHUNKHOUND_EMBEDDING__MODEL = "Qwen/Qwen3-Embedding-8B";
      };
    };
    programs.mcp.servers.chunkhound = {
      command = "chunkhound";
      args = [
        "mcp"
        "--stdio"
      ];
      disabled = false;
    };
  };
}
