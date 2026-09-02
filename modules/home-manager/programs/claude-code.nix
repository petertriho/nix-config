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

    # Block model-initiated plan mode. Custom planning skills (e.g. `planner`)
    # own their own interview-and-write workflow, and Claude Code's built-in
    # plan mode hijacks it: it is read-only, so it blocks the skill's Write, and
    # its approve-a-plan flow replaces the skill's interview. Only the
    # `EnterPlanMode` tool call is blocked; Shift+Tab still enters plan mode.
    # Exit code 2 blocks the call and returns stderr to the model as the reason.
    programs.claude-code.hooks.PreToolUse =
      #bash
      ''
        #!/usr/bin/env bash

        echo "EnterPlanMode is blocked in this environment. Do not switch to writing a plan as chat text. If a skill is active (for example /planner), resume that skill's workflow at its current step, including its interview questions and its file output. Otherwise continue the task in normal mode." >&2
        exit 2
      '';

    home = {
      # file.".claude/skills/context7" = {
      #   source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/context7";
      # };
      file.".claude/settings.json".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/settings.json";
      file.".claude/skills/pter".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/skills/pter";
      sessionVariables = {
        CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = 1;
        CLAUDE_CODE_DISABLE_AUTO_MEMORY = 1;
        CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = 1;
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 1;
        CLAUDE_CODE_NO_FLICKER = 1;
        CLAUDE_CODE_SUPPRESS_SESSION_ATTRIBUTION = 1;
        ENABLE_CLAUDEAI_MCP_SERVERS = "false";
      };
    };

    # The files and skill directory above are out-of-store symlinks; the
    # sandbox resolves through to the tracked target, so it needs the target
    # granted as well.
    programs.nono.agentFilesystem.claude = {
      read = [
        "$HOME/.nix-config/dotfiles/claude/.claude/skills/pter"
      ];
      read_file = [
        "$HOME/.nix-config/dotfiles/claude/.claude/settings.json"
        "$HOME/.nix-config/dotfiles/agents/.agents/output-styles/ste.md"
      ];
    };
  };
}
