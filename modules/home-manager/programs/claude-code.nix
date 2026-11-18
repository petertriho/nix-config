{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.claude-code;
  dotfilesDir = "${config.lib.meta.configPath}/dotfiles";

  # Paths are relative to `dotfiles/`.
  outputStyleSource = "agents/.agents/output-styles/ste.md";

  # Each directory in these folders is linked as a skill of the same name. The
  # flake sees only git-tracked directories. A plugin root is linked whole: the
  # managed-plugin wrapper snapshots top-level entries and can cache a
  # manifest-only plugin.
  skillFolders = [
    "claude/.claude/skills"
    "claude/.claude/plugins"
  ];
  excludedSkills = [ "cockpit" ];

  # Skill name to source directory.
  linkedSkills = lib.mergeAttrsList (
    map (
      folder:
      lib.mapAttrs (name: _: "${folder}/${name}") (
        lib.filterAttrs (name: type: type == "directory" && !(lib.elem name excludedSkills)) (
          builtins.readDir (../../../dotfiles + "/${folder}")
        )
      )
    ) skillFolders
  );

  # Native install self-updates ignore `autoUpdates: false`, so these env vars
  # are the only reliable lever. Teammate child processes that bypass the Nix
  # wrapper see only settings `env` and the session variables, so both get them.
  updateOptOuts = {
    DISABLE_AUTOUPDATER = "1";
    DISABLE_UPDATES = "1";
  };

  planModeHook = "block-enter-plan-mode";
in
{
  options.programs.claude-code.cliProxyApi.enable =
    lib.mkEnableOption "Claude Code routing through the local CLIProxyAPI";

  config = lib.mkIf cfg.enable {
    programs.claude-code = {
      outputStyles.ste = config.lib.meta.mkDotfilesSymlink outputStyleSource;

      # Activation merges these keys into a writable settings.json, so Claude
      # Code can still save runtime changes. Declared keys win on every switch.
      # `model`, `effortLevel`, and `modelSettings` stay undeclared so `/model`
      # changes persist.
      mutableSettings = true;
      settings = {
        # CLAUDE_CODE_TMUX_TRUECOLOR keeps the stylix theme hex exact in tmux.
        env = updateOptOuts // {
          CLAUDE_CODE_TMUX_TRUECOLOR = "1";
        };
        attribution = {
          commit = "";
          pr = "";
          sessionUrl = false;
        };
        includeCoAuthoredBy = false;
        permissions.defaultMode = "auto";
        disableClaudeAiConnectors = true;
        # The Artifact tool needs the bundled `artifact-design` skill.
        disableBundledSkills = false;
        disableRemoteControl = true;
        enableWorkflows = false;
        workflowKeywordTriggerEnabled = false;
        statusLine = {
          type = "command";
          command = "claude-statusline";
          padding = 0;
        };
        outputStyle = "ste";
        autoCompactWindow = 400000;
        idleCompaction = false;
        awaySummaryEnabled = false;
        cleanupPeriodDays = 180;
        tui = "fullscreen";
        verbose = false;
        skipAutoPermissionPrompt = true;
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
                command = ''bash "${cfg.configDir}/hooks/${planModeHook}"'';
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
      hooks.${planModeHook} =
        #bash
        ''
          #!/usr/bin/env bash

          echo "EnterPlanMode is blocked in this environment. Do not switch to writing a plan as chat text. If a skill is active (for example /planner), resume that skill's workflow at its current step, including its interview questions and its file output. Otherwise continue the task in normal mode." >&2
          exit 2
        '';
    };

    home = {
      packages = [ pkgs.llm-agents.claude-agent-acp ];

      file = {
        # Selected by `theme` in the settings. The ANSI base keeps text in the
        # terminal palette. Docked panes otherwise fill with ANSI bright black,
        # and no ANSI color is the terminal background. The hex needs
        # CLAUDE_CODE_TMUX_TRUECOLOR (settings `env`) inside tmux, or Claude Code
        # rounds it to the nearest xterm-256 color.
        "${cfg.configDir}/themes/stylix.json".text = builtins.toJSON {
          name = "Stylix";
          base = "${config.stylix.polarity}-ansi";
          overrides.composerSidebarBackground = config.lib.stylix.colors.withHashtag.base00;
        };
      }
      // lib.mapAttrs' (
        name: source:
        lib.nameValuePair "${cfg.configDir}/skills/${name}" {
          source = config.lib.meta.mkDotfilesSymlink source;
        }
      ) linkedSkills;

      sessionVariables = lib.mkMerge [
        (
          updateOptOuts
          // {
            CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = 1;
            CLAUDE_CODE_DISABLE_AUTO_MEMORY = 1;
            CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = 1;
            # Do not set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, even to 0. Any
            # value withholds the Artifact tool. DISABLE_ERROR_REPORTING,
            # DISABLE_FEEDBACK_COMMAND, DISABLE_TELEMETRY, and DISABLE_AUTOUPDATER
            # keep its other opt-outs.
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 1;
            # Code mode also needs the remote gate `tengu_rustling_blossom`.
            # DISABLE_TELEMETRY turns off flag fetches, so the gate reads as
            # unknown and code mode refuses with `no_flags`. The disk-cache
            # opt-in lets every cached flag apply while telemetry stays off.
            # Code mode refuses through CLIProxyAPI (non-first-party provider).
            # CLAUDE_CODE_EXPERIMENTAL_CODE_MODE = 1;
            CLAUDE_CODE_GB_DISK_CACHE_WHEN_TELEMETRY_OFF = 1;
            CLAUDE_CODE_NO_FLICKER = 1;
            CLAUDE_CODE_SUPPRESS_SESSION_ATTRIBUTION = 1;
            DISABLE_ERROR_REPORTING = 1;
            DISABLE_FEEDBACK_COMMAND = 1;
            # DISABLE_TELEMETRY = 1;
            ENABLE_CLAUDEAI_MCP_SERVERS = "false";
          }
        )
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

    programs.nono = {
      # The linked skills and the output style are out-of-store symlinks. The
      # sandbox resolves through to the tracked target, so it needs the target
      # granted as well.
      agentFilesystem.claude = {
        read = lib.mapAttrsToList (_: source: "${dotfilesDir}/${source}") linkedSkills;
        read_file = [ "${dotfilesDir}/${outputStyleSource}" ];
      };

      # tmux-worker keeps the state of each worker there. The lead writes it,
      # and the hooks of each worker append the turn events.
      sharedFilesystem.allow = [ "$HOME/.local/state/tmux-worker" ];
    };
  };
}
