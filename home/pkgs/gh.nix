{ config, pkgs, ... }:
{
  home.packages = with pkgs; [ gh ];

  xdg.configFile."gh/config.yml".source = config.lib.meta.mkDotfilesSymlink "gh/.config/gh/config.yml";
}
