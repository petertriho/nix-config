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

  # Rendered nix-declared settings, merged into the mutable settings.json by
  # the piMutableSettings activation entry below.
  settingsJson = jsonFormat.generate "pi-coding-agent-settings.json" cfg.settings;

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
      border = "base03";
      borderAccent = "base0D";
      borderMuted = "base02";
      success = "base0B";
      error = "base08";
      warning = "base0A";
      muted = "base04";
      dim = "base04";
      text = "base05";
      thinkingText = "base04";

      # Backgrounds and message content
      selectedBg = "base02";
      userMessageBg = "base01";
      userMessageText = "base05";
      customMessageBg = "base01";
      customMessageText = "base05";
      customMessageLabel = "base0E";
      toolPendingBg = "base01";
      toolSuccessBg = "base01";
      toolErrorBg = "base01";
      toolTitle = "base0D";
      toolOutput = "base05";

      # Markdown
      mdHeading = "base0D";
      mdLink = "base0D";
      mdLinkUrl = "base04";
      mdCode = "base0B";
      mdCodeBlock = "base05";
      mdCodeBlockBorder = "base02";
      mdQuote = "base04";
      mdQuoteBorder = "base03";
      mdHr = "base03";
      mdListBullet = "base0D";

      # Tool diffs
      toolDiffAdded = "base0B";
      toolDiffRemoved = "base08";
      toolDiffContext = "base04";

      # Syntax highlighting (classic base16 mapping)
      syntaxComment = "base04";
      syntaxKeyword = "base0E";
      syntaxFunction = "base0D";
      syntaxVariable = "base08";
      syntaxString = "base0B";
      syntaxNumber = "base09";
      syntaxType = "base0A";
      syntaxOperator = "base0C";
      syntaxPunctuation = "base05";

      # Thinking level borders: subtle to hot ramp
      thinkingOff = "base03";
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
  # Augments the upstream `programs.pi-coding-agent` module; intentionally
  # declares no local options and no default provider/model/thinking level.
  #
  # settings.json is declared here but kept a mutable file: the upstream
  # module's read-only store symlink is disabled and an activation script
  # deep-merges the nix keys into the real file on every switch (nix wins on
  # declared keys). This lets pi persist model/thinking/other runtime settings
  # itself, which would otherwise fail against a store symlink.
  config = lib.mkIf cfg.enable {
    programs.pi-coding-agent = {
      extraPackages = with pkgs; [
        nodejs
        ast-grep
        biome
        prettier
      ];
      settings = {
        npmCommand = [ "npm" ];
        packages = [
          "npm:pi-mcp-adapter@2.15.0"
          "npm:pi-lens@3.8.73"
        ]
        ++ lib.optional config.programs.plannotator.enable "npm:@plannotator/pi-extension@0.25.0";
        theme = "stylix";
      };
    };

    home.file."${cfg.configDir}/themes/stylix.json".source =
      jsonFormat.generate "pi-coding-agent-stylix-theme.json" stylixTheme;

    home.file.".pi-lens/config.json".source = jsonFormat.generate "pi-lens-config.json" {
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
    };

    # Suppress the upstream module's read-only settings.json symlink; the
    # activation entry below owns the file instead.
    home.file."${cfg.configDir}/settings.json".enable = false;

    # Re-assert the nix-declared settings into the mutable settings.json on
    # every switch. Deep merge with nix winning on declared keys; jq `*`
    # replaces arrays wholesale, so `packages` stays fully nix-controlled.
    # Ordered after linkGeneration, which removes the pre-migration symlink.
    home.activation.piMutableSettings = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      piSettingsFile=${lib.escapeShellArg "${cfg.configDir}/settings.json"}
      piSettingsNix=${settingsJson}
      piJq=${pkgs.jq}/bin/jq

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

      run piWriteSettings "$piSettingsFile" "$piSettingsMerged"
      unset piSettingsFile piSettingsNix piJq piSettingsMerged
      unset -f piWriteSettings
    '';
  };
}
