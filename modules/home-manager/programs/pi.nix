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
      dim = "base03";
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
      syntaxComment = "base03";
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
  config = lib.mkIf cfg.enable {
    programs.pi-coding-agent = {
      # npm must be on Pi's wrapped PATH for settings.packages installs.
      extraPackages = [ pkgs.nodejs ];
      settings = {
        npmCommand = [ "npm" ];
        packages = [
          "npm:pi-mcp-adapter@2.15.0"
          "npm:@narumitw/pi-lsp@0.35.0"
        ]
        ++ lib.optional config.programs.plannotator.enable "npm:@plannotator/pi-extension@0.25.0";
        theme = "stylix";
      };
    };

    home.file."${cfg.configDir}/themes/stylix.json".source =
      jsonFormat.generate "pi-coding-agent-stylix-theme.json" stylixTheme;
  };
}
