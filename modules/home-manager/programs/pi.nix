{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.pi-coding-agent;
  colors = config.lib.stylix.colors.withHashtag;
  jsonFormat = pkgs.formats.json { };
  piExtensions = with pkgs.piExtensions; [
    omp-undo-redo
    rpiv-args
    rpiv-ask-user-question
    # rpiv-todo
    # pi-atelier
    pi-autoresearch
    pi-agent-browser-native
    # pi-blackhole
    pi-cache-optimizer
    pi-cliproxyapi-provider
    # pi-dynamic-workflows
    pi-fzfp
    # pi-hashline-edit-pro
    # pi-vim must load before pi-history: pi-vim *replaces* the editor (no
    # preservation of a prior factory), while pi-history *wraps* whatever is
    # current. If pi-history loads first, pi-vim clobbers its HistoryEditor and
    # persistent history / Ctrl+R / ghost completion silently stop working.
    pi-vim
    pi-history
    pi-lens
    # pi-mcp-adapter
    pi-subagents
    pi-tasks
    pi-vcc
    pi-web-access
  ];
  piPackageRoot = package: "${package}/lib/node_modules/${package.pname}";

  # Rendered nix-declared settings, merged into the mutable settings.json by
  # the piMutableSettings activation entry below.
  settingsJson = jsonFormat.generate "pi-coding-agent-settings.json" cfg.settings;
  nonoPiPackageDir = "${config.xdg.configHome}/nono/packages/nolabs-ai/pi";

  outputStyleIsValid = cfg.outputStyle == null || builtins.hasAttr cfg.outputStyle cfg.outputStyles;
  selectedOutputStyle =
    if cfg.outputStyle != null && outputStyleIsValid then cfg.outputStyles.${cfg.outputStyle} else null;
  mkOutputStyleEntry =
    content: if lib.hm.strings.isPathLike content then { source = content; } else { text = content; };

  # Every color token required by Pi's theme schema (see theme-schema.json in
  # the Pi package), mapped onto the Stylix base16 palette.
  stylixTheme = {
    name = "stylix";
    vars = {
      inherit (colors)
        base00
        base01
        base02
        base03
        base04
        base05
        base06
        base07
        base08
        base09
        base0A
        base0B
        base0C
        base0D
        base0E
        base0F
        ;
    };
    colors = {
      # Core UI
      accent = "base0D";
      border = "base04";
      borderAccent = "base0D";
      borderMuted = "base03";
      success = "base0B";
      error = "base08";
      warning = "base0A";
      muted = "base05";
      dim = "base05";
      text = "base06";
      thinkingText = "base05";

      # Backgrounds and message content
      selectedBg = "base02";
      userMessageBg = "base02";
      userMessageText = "base07";
      customMessageBg = "base01";
      customMessageText = "base06";
      customMessageLabel = "base0E";
      toolPendingBg = "base01";
      toolSuccessBg = "base01";
      toolErrorBg = "base01";
      toolTitle = "base06";
      toolOutput = "base05";

      # Markdown
      mdHeading = "base0D";
      mdLink = "base0D";
      mdLinkUrl = "base05";
      mdCode = "base0B";
      mdCodeBlock = "base05";
      mdCodeBlockBorder = "base02";
      mdQuote = "base05";
      mdQuoteBorder = "base03";
      mdHr = "base03";
      mdListBullet = "base0D";

      # Tool diffs
      toolDiffAdded = "base0B";
      toolDiffRemoved = "base08";
      toolDiffContext = "base05";

      # Syntax highlighting (classic base16 mapping)
      syntaxComment = "base05";
      syntaxKeyword = "base0E";
      syntaxFunction = "base0D";
      syntaxVariable = "base08";
      syntaxString = "base0B";
      syntaxNumber = "base09";
      syntaxType = "base0A";
      syntaxOperator = "base0C";
      syntaxPunctuation = "base05";

      # Thinking level borders: subtle to hot ramp
      thinkingOff = "base04";
      thinkingMinimal = "base0C";
      thinkingLow = "base0D";
      thinkingMedium = "base0B";
      thinkingHigh = "base0A";
      thinkingXhigh = "base09";
      thinkingMax = "base08";

      # Bash mode editor border
      bashMode = "base0A";
    };
  };
in
{
  # Augments the upstream `programs.pi-coding-agent` module with local
  # output-style options. It declares no default provider, model, or thinking level.
  #
  # settings.json is declared here but kept a mutable file: the upstream
  # module's read-only store symlink is disabled and an activation script
  # deep-merges the nix keys into the real file on every switch (nix wins on
  # declared keys). This lets pi persist model/thinking/other runtime settings
  # itself, which would otherwise fail against a store symlink.
  options.programs.pi-coding-agent = {
    outputStyles = lib.mkOption {
      type = with lib.types; attrsOf (either lines path);
      default = { };
      example = lib.literalExpression ''
        {
          concise = ./output-styles/concise.md;
          terse = "Use concise prose.";
        }
      '';
      description = ''
        Named output styles for Pi Coding Agent. Each value is inline content or
        a path to a file. The selected style is written to
        {file}`APPEND_SYSTEM.md` inside
        {option}`programs.pi-coding-agent.configDir`.
      '';
    };

    outputStyle = lib.mkOption {
      type = with lib.types; nullOr str;
      default = null;
      example = "ste";
      description = ''
        Name of the output style to append to Pi's system prompt. Set this to
        `null` to leave {file}`APPEND_SYSTEM.md` unmanaged.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = outputStyleIsValid;
        message = ''
          programs.pi-coding-agent.outputStyle is "${cfg.outputStyle}", but no matching
          entry exists in programs.pi-coding-agent.outputStyles. Available styles: ${
            let
              names = lib.attrNames cfg.outputStyles;
            in
            if names == [ ] then "(none)" else lib.concatStringsSep ", " names
          }
        '';
      }
    ];

    programs.pi-coding-agent = {
      outputStyles.ste = lib.mkDefault (
        config.lib.meta.mkDotfilesSymlink "agents/.agents/output-styles/ste.md"
      );
      outputStyle = lib.mkDefault "ste";
      extraPackages = with pkgs; [
        nodejs
        ast-grep
        biome
        prettier
      ];
      keybindings = {
        "app.model.cycleForward" = [ ];
        "tui.select.up" = [
          "up"
          "ctrl+p"
        ];
        "tui.select.down" = [
          "down"
          "ctrl+n"
        ];
        "tui.altScreen.halfPageDown" = [
          "ctrl+alt+d"
        ];
        "tui.altScreen.halfPageUp" = [
          "ctrl+alt+u"
        ];
        "tui.altScreen.nextPrompt" = [
          "ctrl+shift+d"
        ];
        "tui.altScreen.previousPrompt" = [
          "ctrl+shift+u"
        ];
        "app.message.dequeue" = [ "ctrl+q" ];
      };
      settings = {
        defaultProjectTrust = "always";
        editorPaddingX = 1;
        enableInstallTelemetry = false;
        outputPad = 1;
        # pi-cliproxyapi-provider bundles two extension entry points in its
        # package.json `pi.extensions`: extensions/index.ts (the CLIProxyAPI model
        # provider) and extensions/tps.ts (the Elapsed/TPS TUI footer + settle
        # toast). The object form narrows the manifest so only index.ts loads.
        # https://github.com/router-for-me/pi-cliproxyapi-provider#elapsed-time-and-tps-tui
        packages =
          map piPackageRoot (builtins.filter (p: p.pname != "pi-cliproxyapi-provider") piExtensions)
          ++ [
            {
              source = piPackageRoot pkgs.piExtensions.pi-cliproxyapi-provider;
              extensions = [ "!extensions/tps.ts" ];
            }
          ];
        quietStartup = true;
        theme = "stylix";
        tuiMode = "fullscreen";
      };
    };
    home = {
      file = {
        # Pi supports one global append prompt. The selected output style owns it.
        "${cfg.configDir}/APPEND_SYSTEM.md" = lib.mkIf (selectedOutputStyle != null) (
          mkOutputStyleEntry selectedOutputStyle
        );
        "${cfg.configDir}/themes/stylix.json".source =
          jsonFormat.generate "pi-coding-agent-stylix-theme.json" stylixTheme;

        "${cfg.configDir}/extensions/pi-tui-shell.ts".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-tui-shell.ts";

        "${cfg.configDir}/extensions/pi-message-diagnostics.ts".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-message-diagnostics.ts";

        # Provider compat overrides only (pi-cache-optimizer recommendations for
        # the zai/opencode-go gateways) — no credentials, models, or baseUrls; pi
        # merges these over its built-in provider definitions. Out-of-store
        # symlink so `/cache-optimizer fix` can still rewrite it at runtime.
        "${cfg.configDir}/models.json".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/models.json";

        ".pi-lens/config.json".source = jsonFormat.generate "pi-lens-config.json" {
          widget.visible = false;
          format = {
            enabled = true;
            mode = "deferred";
          };
          autofix.enabled = true;
          actionableWarnings = {
            enabled = true;
            includeLspCodeActions = true;
            deltaOnly = true;
            autoFix = {
              enabled = true;
              maxFixes = 5;
            };
          };
          contextInjection.enabled = false;
        };

        # Suppress the upstream module's read-only settings.json symlink; the
        # activation entry below owns the file instead.
        "${cfg.configDir}/settings.json".enable = false;
      };

      # Re-assert the nix-declared settings into the mutable settings.json on
      # every switch. Deep merge with nix winning on declared keys; jq `*`
      # replaces arrays wholesale, so `packages` stays nix-controlled except
      # for the official nono Pi pack while its mutable pack directory exists.
      # Ordered after linkGeneration, which removes the pre-migration symlink.
      activation.piMutableSettings = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        piSettingsFile=${lib.escapeShellArg "${cfg.configDir}/settings.json"}
        piSettingsNix=${settingsJson}
        piJq=${pkgs.jq}/bin/jq
        nonoPiPackageDir=${lib.escapeShellArg nonoPiPackageDir}

        # Atomic write: temp file in the same directory + rename, so a running
        # pi never observes a torn file.
        function piWriteSettings {
          local tmp
          tmp=$(mktemp "$1.tmp.XXXXXX")
          printf '%s\n' "$2" > "$tmp"
          mv "$tmp" "$1"
        }

        # Leftover symlink at the target (linkGeneration normally cleans up the
        # previous generation's link; belt and braces for the first migration).
        if [[ -L "$piSettingsFile" ]]; then
          run rm $VERBOSE_ARG "$piSettingsFile"
        fi

        run mkdir -p $VERBOSE_ARG "$(dirname "$piSettingsFile")"

        if [[ -f "$piSettingsFile" && ! -L "$piSettingsFile" ]]; then
          if "$piJq" -e . "$piSettingsFile" > /dev/null 2>&1; then
            piSettingsMerged=$("$piJq" -s '.[0] * .[1]' "$piSettingsFile" "$piSettingsNix")
          else
            warnEcho "$piSettingsFile is not valid JSON; backing it up to $piSettingsFile.bak"
            run mv $VERBOSE_ARG "$piSettingsFile" "$piSettingsFile.bak"
            piSettingsMerged=$(cat "$piSettingsNix")
          fi
        else
          piSettingsMerged=$(cat "$piSettingsNix")
        fi

        if [[ -d "$nonoPiPackageDir" ]]; then
          piSettingsMerged=$(printf '%s\n' "$piSettingsMerged" | "$piJq" --arg source "$nonoPiPackageDir" '
            .packages = (
              [(.packages // [])[] | select(type != "object" or .source? != $source)]
              + [{ source: $source }]
            )
          ')
        fi

        run piWriteSettings "$piSettingsFile" "$piSettingsMerged"
        unset piSettingsFile piSettingsNix piJq piSettingsMerged nonoPiPackageDir
        unset -f piWriteSettings
      '';
    };
  };
}
