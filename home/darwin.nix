{ config, ... }:
{
  imports = [
    ./base.nix
    ./pkgs/alacritty.nix
    ./pkgs/colima.nix
    ./pkgs/wezterm.nix
  ];

  xdg.configFile = {
    "aerospace".source = config.lib.meta.mkDotfilesSymlink "aerospace/.config/aerospace";
    # "karabiner/karabiner.json".source =
    #   config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
  };
}
