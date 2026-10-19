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
  options.programs.claude-code.cliProxyApi.enable =
    lib.mkEnableOption "Claude Code routing through the local CLIProxyAPI";

  config = lib.mkIf cfg.enable {
    programs.claude-code.outputStyles.ste = config.lib.meta.mkDotfilesSymlink "agents/.agents/output-styles/ste.md";

    # Activation merges these keys into a writable settings.json, so Claude
    # Code can still save runtime changes. Declared keys win on every switch.
    # `model` and `effortLevel` stay undeclared so `/model` changes persist.
    programs.claude-code.mutableSettings = true;
    programs.claude-code.settings = {
      # Teammate child processes that bypass the Nix wrapper only see these.
      # CLAUDE_CODE_TMUX_TRUECOLOR keeps the stylix theme hex exact in tmux.
      env = {
        CLAUDE_CODE_TMUX_TRUECOLOR = "1";
        DISABLE_AUTOUPDATER = "1";
        DISABLE_UPDATES = "1";
      };
      attribution = {
        commit = "";
        pr = "";
        sessionUrl = false;
      };
      includeCoAuthoredBy = false;
      permissions.defaultMode = "bypassPermissions";
      disableClaudeAiConnectors = true;
      disableBundledSkills = true;
      disableRemoteControl = true;
      disableArtifact = true;
      enableWorkflows = false;
      workflowKeywordTriggerEnabled = false;
      statusLine = {
        type = "command";
        command = "claude-statusline";
        padding = 0;
      };
      outputStyle = "ste";
      autoCompactWindow = 400000;
      tui = "fullscreen";
      skipDangerousModePermissionPrompt = true;
      theme = "custom:stylix";
      editorMode = "vim";
      teammateMode = "auto";
      remoteControlAtStartup = false;
      hooks.PreToolUse = [
        {
          matcher = "EnterPlanMode";
          hooks = [
            {
              type = "command";
              command = ''bash "$HOME/.claude/hooks/PreToolUse"'';
            }
          ];
        }
      ];
    };

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
      packages = [ pkgs.llm-agents.claude-agent-acp ];
      # file.".claude/skills/context7" = {
      #   source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/context7";
      # };
      # Selected by `theme` in programs.claude-code.settings. The ANSI base keeps text in
      # the terminal palette. Docked panes otherwise fill with ANSI bright black,
      # and no ANSI color is the terminal background. The hex needs
      # CLAUDE_CODE_TMUX_TRUECOLOR (settings `env`) inside tmux, or Claude Code
      # rounds it to the nearest xterm-256 color.
      file.".claude/themes/stylix.json".text = builtins.toJSON {
        name = "Stylix";
        base = "${config.stylix.polarity}-ansi";
        overrides.composerSidebarBackground = config.lib.stylix.colors.withHashtag.base00;
      };
      # The managed-plugin wrapper snapshots top-level entries and can cache
      # a manifest-only plugin. Link the complete plugin root directly instead.
      file.".claude/skills/cockpit".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/plugins/cockpit";
      file.".claude/skills/peter".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/skills/peter";
      file.".claude/skills/peter-exp".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/skills/peter-exp";
      file.".claude/skills/pi-subagent".source =
        config.lib.meta.mkDotfilesSymlink "claude/.claude/skills/pi-subagent";
      sessionVariables = lib.mkMerge [
        {
          CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = 1;
          CLAUDE_CODE_DISABLE_AUTO_MEMORY = 1;
          CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = 1;
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = 1;
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 1;
          CLAUDE_CODE_NO_FLICKER = 1;
          CLAUDE_CODE_SUPPRESS_SESSION_ATTRIBUTION = 1;
          # Native install self-updates ignore `autoUpdates: false`. These env
          # vars are the only reliable lever, and teammate child processes that
          # bypass the Nix wrapper only see them via settings `env` / this block.
          DISABLE_AUTOUPDATER = 1;
          DISABLE_TELEMETRY = 1;
          DISABLE_UPDATES = 1;
          ENABLE_CLAUDEAI_MCP_SERVERS = "false";
        }
        (lib.mkIf cfg.cliProxyApi.enable {
          ANTHROPIC_BASE_URL = config.home.sessionVariables.CLIPROXYAPI_BASE_URL;
          ANTHROPIC_AUTH_TOKEN = config.home.sessionVariables.CLI_PROXY_API_KEY;
          ANTHROPIC_DEFAULT_FABLE_MODEL = "gpt-6-astra";
          ANTHROPIC_DEFAULT_OPUS_MODEL = "gpt-6.1-sol";
          ANTHROPIC_DEFAULT_SONNET_MODEL = "gpt-6-luna";
          ANTHROPIC_DEFAULT_HAIKU_MODEL = "gpt-6-luna";
          CLAUDE_CODE_MAX_CONTEXT_TOKENS = "272000";
          API_TIMEOUT_MS = "3000000";
        })
      ];
    };

    # The skill directories and output style above are out-of-store symlinks; the
    # sandbox resolves through to the tracked target, so it needs the target
    # granted as well.
    programs.nono.agentFilesystem.claude = {
      read = [
        "$HOME/.nix-config/dotfiles/claude/.claude/skills/peter"
        "$HOME/.nix-config/dotfiles/claude/.claude/skills/peter-exp"
        "$HOME/.nix-config/dotfiles/claude/.claude/skills/pi-subagent"
        "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
      ];
      read_file = [
        "$HOME/.nix-config/dotfiles/agents/.agents/output-styles/ste.md"
      ];
    };
  };
}
