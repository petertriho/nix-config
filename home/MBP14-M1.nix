{ config, ... }:
{
  imports = [
    ./base.nix
    ./pkgs/wezterm.nix
  ];

  home.homeDirectory = "/Users/peter";
  xdg.configFile."karabiner/karabiner.json".source = config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
}
