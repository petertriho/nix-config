{
  config,
  lib,
  pkgs,
  ...
}:
let
  aliases = {
    catppuccin = "catppuccin-mocha";
  };
  tokyoNightSource = pkgs.vimPlugins.tokyonight-nvim.src;
  tokyoNightSharedPalette = builtins.readFile "${tokyoNightSource}/lua/tokyonight/colors/storm.lua";
  tokyoNightNightOverrides = builtins.readFile "${tokyoNightSource}/lua/tokyonight/colors/night.lua";
  extractTokyoNightColor =
    palette: name:
    let
      matches = map (
        line:
        builtins.match ''^[[:space:]]*${name}[[:space:]]*=[[:space:]]*"#([0-9A-Fa-f]{6})",?[[:space:]]*$'' line
      ) (lib.splitString "\n" palette);
      match = lib.findFirst (value: value != null) null matches;
    in
    if match == null then
      throw "tokyonight.nvim palette is missing color `${name}`"
    else
      builtins.head match;
  sharedPalette = extractTokyoNightColor tokyoNightSharedPalette;
  nightOverrides = extractTokyoNightColor tokyoNightNightOverrides;
  tokyoNightScheme = {
    scheme = "Tokyo Night";
    author = "folke/tokyonight.nvim";
    variant = "dark";
    base00 = nightOverrides "bg";
    base01 = nightOverrides "bg_dark";
    base02 = sharedPalette "bg_highlight";
    base03 = sharedPalette "terminal_black";
    base04 = sharedPalette "comment";
    base05 = sharedPalette "fg_dark";
    base06 = sharedPalette "fg";
    base07 = sharedPalette "fg";
    base08 = sharedPalette "red";
    base09 = sharedPalette "orange";
    base0A = sharedPalette "yellow";
    base0B = sharedPalette "green";
    base0C = sharedPalette "cyan";
    base0D = sharedPalette "blue";
    base0E = sharedPalette "magenta";
    base0F = sharedPalette "purple";
    # Base24 extension for the darker surfaces and distinct bright ANSI colors.
    base10 = "15161e";
    base11 = nightOverrides "bg_dark1";
    base12 = "ff899d";
    base13 = "faba4a";
    base14 = "9fe044";
    base15 = "a4daff";
    base16 = "8db0ff";
    base17 = "c7a9ff";
  };
  slug = aliases.${config.theme} or config.theme;
  validSlug = builtins.match "[a-z0-9]+(-[a-z0-9]+)*" slug != null;
  candidate = "${pkgs.base16-schemes}/share/themes/${slug}.yaml";
  scheme =
    if config.theme == "tokyonight" then
      tokyoNightScheme
    else if !validSlug then
      throw "theme `${config.theme}` is not a valid Base16 scheme slug"
    else if !builtins.pathExists candidate then
      throw "theme `${config.theme}` resolves to unknown Base16 scheme `${slug}`"
    else
      candidate;
  variant = config.lib.stylix.colors.variant or null;
in
{
  stylix = {
    enable = true;
    autoEnable = false;
    base16Scheme = scheme;
    polarity =
      if
        builtins.elem variant [
          "dark"
          "light"
        ]
      then
        variant
      else
        throw "theme `${config.theme}` has missing or unsupported variant metadata";
    fonts.monospace = {
      package = pkgs.nerd-fonts.jetbrains-mono;
      name = "JetBrainsMono Nerd Font Mono";
    };
    opacity = {
      desktop = 1.0;
      applications = 1.0;
      terminal = 1.0;
      popups = 1.0;
    };
  };
}
