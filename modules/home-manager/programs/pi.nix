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
  piHistoryStateDir = "${config.xdg.stateHome}/pi";
  piExtensions = with pkgs.piExtensions; [
    # omp-undo-redo
    rpiv-args
    rpiv-ask-user-question
    # rpiv-todo
    pi-autoresearch
    pi-blackhole
    pi-cache-optimizer
    pi-codex-tools
    pi-fzfp
    pi-goal-x
    pi-vim
    pi-lens
    # pi-subagents
    pi-tasks
    # pi-vcc
    (pine-of-glass.override { enableContextimate = false; })
  ];
  piPackageRoot = package: "${package}/lib/node_modules/${package.pname}";

  # Rendered nix-declared settings, merged into the mutable settings.json by
  # the piMutableSettings activation entry below. The nono Pi pack is loaded
  # straight from the Nix store output (see programs.nono.agentPacksPackage),
  # so no mutable nono package directory is discovered at activation time.
  settingsJson = jsonFormat.generate "pi-coding-agent-settings.json" cfg.settings;
  # Native MCP reads the agent directory, not the shared XDG MCP file.
  # Normalize disabled flags and wrap file-backed environment variables.
  mcpJson = jsonFormat.generate "pi-coding-agent-mcp.json" {
    mcpServers = lib.mapAttrs (
      name: server:
      (lib.hm.mcp.transformMcpServer {
        inherit server;
        extraTransforms = [
          (lib.hm.mcp.wrapEnvFilesCommand { inherit pkgs name; })
        ];
      })
      // {
        exposure = server.exposure or "codemode";
      }
      // lib.optionalAttrs (server ? toolExposure) {
        inherit (server) toolExposure;
      }
    ) config.programs.mcp.servers;
  };

  # Keep runtime edits writable. Nix values win, and jq replaces arrays.
  mutableJsonActivation =
    target: source:
    lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      piConfigFile=${lib.escapeShellArg target}
      piConfigNix=${source}
      piJq=${pkgs.jq}/bin/jq

      # Replace the target atomically and remove a failed temporary file.
      function piWriteConfig {
        local target="$1"
        local tmp
        tmp=$(mktemp "$target.tmp.XXXXXX") || return 1

        if ! cat > "$tmp" || ! mv "$tmp" "$target"; then
          rm -f "$tmp"
          return 1
        fi
      }

      # Remove a stale symlink if linkGeneration did not remove it.
      if [[ -L "$piConfigFile" ]]; then
        run rm $VERBOSE_ARG "$piConfigFile"
      fi

      run mkdir -p $VERBOSE_ARG "$(dirname "$piConfigFile")"

      if [[ -f "$piConfigFile" && ! -L "$piConfigFile" ]]; then
        if "$piJq" -e . "$piConfigFile" > /dev/null 2>&1; then
          piConfigMerged=$("$piJq" -s '.[0] * .[1]' "$piConfigFile" "$piConfigNix")
        else
          warnEcho "$piConfigFile is not valid JSON; backing it up to $piConfigFile.bak"
          run mv $VERBOSE_ARG "$piConfigFile" "$piConfigFile.bak"
          piConfigMerged=$(cat "$piConfigNix")
        fi
      else
        piConfigMerged=$(cat "$piConfigNix")
      fi

      run piWriteConfig "$piConfigFile" <<< "$piConfigMerged"
      unset piConfigFile piConfigNix piJq piConfigMerged
      unset -f piWriteConfig
    '';

  blackholePrimaryModel = {
    provider = "cliproxyapi";
    id = "gpt-6-luna";
    thinking = "low";
  };
  blackholeFallbackModel = {
    provider = "opencode-go";
    id = "gpt-6-luna";
    thinking = "low";
  };
  blackholeOwnedSettings = {
    model = blackholePrimaryModel;
    observerModel = blackholePrimaryModel;
    reflectorModel = blackholePrimaryModel;
    dropperModel = blackholePrimaryModel;
    observerFallbackModels = [ blackholeFallbackModel ];
    reflectorFallbackModels = [ blackholeFallbackModel ];
    dropperFallbackModels = [ blackholeFallbackModel ];
    sessionFallback = true;
  };
  blackholeOwnedJson = jsonFormat.generate "pi-blackhole-owned.json" blackholeOwnedSettings;
  blackholeBaselineJson = jsonFormat.generate "pi-blackhole-baseline.json" (
    blackholeOwnedSettings
    // {
      compaction = "auto";
      compactionEngine = "blackhole";
      memory = true;
    }
  );

  outputStyleIsValid = cfg.outputStyle == null || builtins.hasAttr cfg.outputStyle cfg.outputStyles;
  selectedOutputStyle =
    if cfg.outputStyle != null && outputStyleIsValid then cfg.outputStyles.${cfg.outputStyle} else null;
  # Pi injects APPEND_SYSTEM.md into the system prompt verbatim, but styles
  # shared with Claude Code start with a YAML frontmatter block that only
  # Claude Code parses. Strip a leading frontmatter block at build time; this
  # requires path values to be in-store so the build can read them and
  # rebuilds trigger on content changes (out-of-store symlinks do neither).
  stripFrontmatter =
    content:
    let
      src =
        if lib.hm.strings.isPathLike content then content else pkgs.writeText "pi-output-style.md" content;
    in
    pkgs.runCommand "pi-append-system-prompt.md" { } ''
      awk '
        NR == 1 && $0 == "---" { fm = 1; next }
        fm == 1 { if ($0 == "---") fm = 2; next }
        fm == 2 && !body && $0 == "" { next }
        { body = 1; print }
      ' ${src} > $out
    '';
  mkOutputStyleEntry = content: { source = stripFrontmatter content; };

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
        an in-store path to a file. The selected style is written to
        {file}`APPEND_SYSTEM.md` inside
        {option}`programs.pi-coding-agent.configDir`, with any leading YAML
        frontmatter block (Claude Code output style metadata) stripped.
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

    piLensSettings = lib.mkOption {
      type = jsonFormat.type;
      default = { };
      description = ''
        Settings written to the global pi-lens {file}`config.json`. Other local
        modules can add client-specific settings before the file is generated.
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

    # The out-of-store extension symlinks below resolve to these targets, so the
    # sandbox needs them granted. `models.json` stays writable because
    # `/cache-optimizer fix` rewrites it at runtime. The output style needs no
    # grant: `stripFrontmatter` copies it into the store at build time.
    #
    # `$HOME/.pi-lens` is pi-lens's own state directory. It holds the nix-store
    # config.json symlink plus runtime state that pi-lens writes (logs,
    # projects/, instances.json). nono resolves the config symlink to /nix/store
    # and grants it there, but the kernel still has to traverse
    # `$HOME/.pi-lens` to reach the symlink. Grant the directory read-write so
    # both the traversal and the runtime writes succeed.
    programs.nono.agentFilesystem.pi = {
      allow = [
        "$HOME/.pi-lens"
        piHistoryStateDir
      ];
      read = [ "$HOME/.nix-config/dotfiles/pi/.pi/agent/extensions" ];
      read_file = [ "$HOME/.nix-config/dotfiles/pi/.pi/agent/pi-meantime.json" ];
      allow_file = [ "$HOME/.nix-config/dotfiles/pi/.pi/agent/models.json" ];
    };

    programs.pi-coding-agent = {
      outputStyles.ste = lib.mkDefault ../../../dotfiles/agents/.agents/output-styles/ste.md;
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
        "tui.altScreen.search" = [ "ctrl+alt+f" ];
        "app.message.dequeue" = [ "ctrl+q" ];
      };
      settings = {
        defaultProjectTrust = "always";
        defaultTools = [ "+codemode" ];
        editorPaddingX = 1;
        enableInstallTelemetry = false;
        outputPad = 1;
        packages = map piPackageRoot piExtensions ++ [
          # The nono Pi pack (extension + skill) from the pinned
          # nono-packs derivation. Declared, not registry-discovered.
          {
            source = "${config.programs.nono.agentPacksPackage}/share/nono-packs/packs/pi";
          }
        ];
        quietStartup = true;
        theme = "stylix";
        tuiMode = "fullscreen";
      };
      piLensSettings = {
        widget.visible = false;
        format = {
          enabled = false;
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
    };
    home = {
      file = {
        # Pi supports one global append prompt. The selected output style owns it.
        "${cfg.configDir}/APPEND_SYSTEM.md" = lib.mkIf (selectedOutputStyle != null) (
          mkOutputStyleEntry selectedOutputStyle
        );
        "${cfg.configDir}/themes/stylix.json".source =
          jsonFormat.generate "pi-coding-agent-stylix-theme.json" stylixTheme;
        "${cfg.configDir}/pi-meantime.json".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/pi-meantime.json";
        "${cfg.configDir}/tasks-config.json".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/tasks-config.json";
        "${cfg.configDir}/extensions/pi-context-window-cap.ts".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-context-window-cap.ts";
        # "${cfg.configDir}/extensions/pi-context.ts".source =
        #   config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-context.ts";
        "${cfg.configDir}/extensions/pi-dashboard.ts".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-dashboard.ts";
        "${cfg.configDir}/extensions/pi-message-diagnostics.ts".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-message-diagnostics.ts";
        "${cfg.configDir}/extensions/pi-tui-shell.ts".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-tui-shell.ts";
        "${cfg.configDir}/extensions/pi-subagents".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-subagents";
        "${cfg.configDir}/extensions/pi-workflows".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-workflows";
        # Transport-neutral imports are siblings of both extension entry points.
        # This directory has no index.ts, so Pi does not load it as an extension.
        "${cfg.configDir}/extensions/workflow-provider".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/workflow-provider";
        "${cfg.configDir}/extensions/pi-history".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-history";

        ".pi/web-search.json".source = config.lib.meta.mkDotfilesSymlink "pi/.pi/web-search.json";

        # Provider compat overrides only (pi-cache-optimizer recommendations for
        # the zai/opencode-go gateways) — no credentials, models, or baseUrls; pi
        # merges these over its built-in provider definitions. Out-of-store
        # symlink so `/cache-optimizer fix` can still rewrite it at runtime.
        "${cfg.configDir}/models.json".source =
          config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/models.json";

        ".pi-lens/config.json".source = jsonFormat.generate "pi-lens-config.json" cfg.piLensSettings;

        # The activation entry owns this mutable file.
        "${cfg.configDir}/settings.json".enable = false;
      };

      activation.piHistoryState = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
        run ${pkgs.coreutils}/bin/install -d -m 0700 ${lib.escapeShellArg piHistoryStateDir}
      '';

      activation.piMutableSettings = mutableJsonActivation "${cfg.configDir}/settings.json" settingsJson;

      # Preserve CLI-added servers and runtime enablement changes.
      activation.piMutableMcp = lib.mkIf config.programs.mcp.enable (
        mutableJsonActivation "${cfg.configDir}/mcp.json" mcpJson
      );

      # Keep unrelated runtime tuning writable, but replace complete worker
      # model objects so stale per-model tuning cannot survive activation.
      activation.piBlackholeConfig = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        blackholeFile=${lib.escapeShellArg "${cfg.configDir}/pi-blackhole/pi-blackhole-config.json"}
        blackholeJq=${pkgs.jq}/bin/jq
        blackholeOwned=${blackholeOwnedJson}
        blackholeBaseline=${blackholeBaselineJson}

        function writeBlackholeConfig {
          local target="$1"
          local tmp
          tmp=$(mktemp "$target.tmp.XXXXXX") || return 1
          if ! cat > "$tmp" || ! mv "$tmp" "$target"; then
            rm -f "$tmp"
            return 1
          fi
        }

        if [[ -L "$blackholeFile" || ( -e "$blackholeFile" && ! -f "$blackholeFile" ) ]]; then
          echo "pi-blackhole: $blackholeFile must be a regular file, not a link or special file; repair it before activating" >&2
          exit 1
        fi
        if [[ -f "$blackholeFile" ]] &&
          ! "$blackholeJq" -e -s 'length == 1 and (.[0] | type == "object")' "$blackholeFile" > /dev/null 2>&1; then
          echo "pi-blackhole: $blackholeFile must contain one valid JSON object; repair it before activating" >&2
          exit 1
        fi

        run mkdir -p $VERBOSE_ARG "$(dirname "$blackholeFile")"
        if [[ -f "$blackholeFile" ]]; then
          blackholeMerged=$("$blackholeJq" -s '.[0] + .[1] | del(.model)' "$blackholeFile" "$blackholeOwned")
        else
          blackholeMerged=$(cat "$blackholeBaseline")
        fi
        run writeBlackholeConfig "$blackholeFile" <<< "$blackholeMerged"
        unset blackholeFile blackholeJq blackholeOwned blackholeBaseline blackholeMerged
        unset -f writeBlackholeConfig
      '';
    };
  };
}
