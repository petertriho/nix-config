{
  config,
  lib,
  ...
}:
let
  cfg = config.programs.claude-code;
in
{
  config = lib.mkIf cfg.enable {
    programs.claude-code.outputStyles.ste = config.lib.meta.mkDotfilesSymlink "agents/.agents/output-styles/ste.md";

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
    };

    # Both files above are out-of-store symlinks; the sandbox resolves through
    # to the tracked target, so it needs the target granted as well.
    programs.nono.agentFilesystem.claude.read_file = [
      "$HOME/.nix-config/dotfiles/claude/.claude/settings.json"
      "$HOME/.nix-config/dotfiles/agents/.agents/output-styles/ste.md"
    ];
  };
}
