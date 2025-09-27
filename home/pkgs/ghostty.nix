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

  xdg.configFile = {
    "ghostty/config".source = config.lib.meta.mkDotfilesSymlink "ghostty/.config/ghostty/config";
    "ghostty/themes".source = config.lib.meta.mkDotfilesSymlink "ghostty/.config/ghostty/themes";
    "ghostty/system".text =
      if pkgs.stdenv.isLinux then
        ''
          font-size = 10
        ''
      else
        ''
          font-size = 13
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
