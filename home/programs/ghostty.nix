{
  lib,
  config,
  pkgs,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
  fontSize = if pkgs.stdenv.isLinux then 11 else 13;
in
{
  home.packages =
    with pkgs;
    lib.mkIf pkgs.stdenv.isLinux [
      ghostty
    ];

  xdg.configFile = {
    "ghostty/config".source = config.lib.meta.mkDotfilesSymlink "ghostty/.config/ghostty/config";
    "stylix/ghostty.conf".text = ''
      foreground = ${colors.base05}
      background = ${colors.base00}
      cursor-text = ${colors.base00}
      cursor-color = ${colors.base05}
      selection-foreground = ${colors.base05}
      selection-background = ${colors.base02}
      palette = 0=${colors.base10}
      palette = 1=${colors.base08}
      palette = 2=${colors.base0B}
      palette = 3=${colors.base0A}
      palette = 4=${colors.base0D}
      palette = 5=${colors.base0E}
      palette = 6=${colors.base0C}
      palette = 7=${colors.base05}
      palette = 8=${colors.base03}
      palette = 9=${colors.base12}
      palette = 10=${colors.base14}
      palette = 11=${colors.base13}
      palette = 12=${colors.base16}
      palette = 13=${colors.base17}
      palette = 14=${colors.base15}
      palette = 15=${colors.base07}
      font-family = "${config.stylix.fonts.monospace.name}"
      font-size = ${toString fontSize}
      background-opacity = ${toString config.stylix.opacity.terminal}
    '';
    "ghostty/system".text =
      if pkgs.stdenv.isLinux then
        ""
      else
        ''
          font-thicken = true
          macos-option-as-alt = true
        '';
  };

  targets.darwin.defaults = lib.mkIf pkgs.stdenv.isDarwin {
    "com.mitchellh.ghostty" = {
      AppleFontSmoothing = 0;
    };
  };
}
