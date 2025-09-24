{
  lib,
  config,
  pkgs,
  ...
}:
{
  home.packages =
    with pkgs;
    lib.mkIf pkgs.stdenv.isLinux [
      ghostty
    ];
  xdg.configFile."ghostty".source = config.lib.meta.mkDotfilesSymlink "ghostty/.config/ghostty";

  targets.darwin.defaults = lib.mkIf pkgs.stdenv.isDarwin {
    "com.mitchellh.ghostty" = {
      AppleFontSmoothing = 0;
    };
  };
}
