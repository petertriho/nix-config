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
  tokyoNightPalette = lib.splitString "\n" (
    builtins.readFile "${tokyoNightSource}/extras/lua/tokyonight_night.lua"
  );
  extractTokyoNightColor =
    name:
    let
      matches = map (
        line:
        builtins.match ''^[[:space:]]*${name}[[:space:]]*=[[:space:]]*"#([0-9A-Fa-f]{6})",?[[:space:]]*$'' line
      ) tokyoNightPalette;
      match = lib.findFirst (value: value != null) null matches;
    in
    if match == null then
      throw "tokyonight.nvim palette is missing color `${name}`"
    else
      builtins.head match;
  tokyoNightScheme = {
    system = "base24";
    scheme = "Tokyo Night";
    author = "folke/tokyonight.nvim";
    variant = "dark";
    base00 = extractTokyoNightColor "bg";
    base01 = extractTokyoNightColor "bg_dark";
    base02 = extractTokyoNightColor "bg_visual";
    base03 = extractTokyoNightColor "comment";
    base04 = extractTokyoNightColor "dark5";
    base05 = extractTokyoNightColor "fg_dark";
    base06 = extractTokyoNightColor "fg";
    base07 = extractTokyoNightColor "white_bright";
    base08 = extractTokyoNightColor "red";
    base09 = extractTokyoNightColor "orange";
    base0A = extractTokyoNightColor "yellow";
    base0B = extractTokyoNightColor "green";
    base0C = extractTokyoNightColor "cyan";
    base0D = extractTokyoNightColor "blue";
    base0E = extractTokyoNightColor "magenta";
    base0F = extractTokyoNightColor "red1";
    base10 = extractTokyoNightColor "black";
    base11 = extractTokyoNightColor "bg_dark1";
    base12 = extractTokyoNightColor "red_bright";
    base13 = extractTokyoNightColor "yellow_bright";
    base14 = extractTokyoNightColor "green_bright";
    base15 = extractTokyoNightColor "cyan_bright";
    base16 = extractTokyoNightColor "blue_bright";
    base17 = extractTokyoNightColor "magenta_bright";
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
