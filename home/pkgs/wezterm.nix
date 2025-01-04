{
  config,
  pkgs,
  lib,
  ...
}:
{
  home.packages =
    with pkgs;
    lib.mkIf pkgs.stdenv.isLinux [
      wezterm
    ];
  xdg.configFile."wezterm".source = config.lib.meta.mkDotfilesSymlink "wezterm/.config/wezterm";
}
