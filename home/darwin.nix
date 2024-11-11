{ config, ... }:
{
  imports = [
    ./base.nix
    ./pkgs/wezterm.nix
  ];

  xdg.configFile."aerospace".source = config.lib.meta.mkDotfilesSymlink "aerospace/.config/aerospace";
  xdg.configFile."karabiner/karabiner.json".source = config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
}
