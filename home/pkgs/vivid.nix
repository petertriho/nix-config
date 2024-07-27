{ config, pkgs, ... }:
{
  home.packages = with pkgs; [ vivid ];

  xdg.configFile."vivid".source = config.lib.meta.mkDotfilesSymlink "vivid/.config/vivid";
}
