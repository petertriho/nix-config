{ config, ... }:
{
  imports = [
    ./base.nix
    ./pkgs/wezterm.nix
  ];

  xdg.configFile."karabiner/karabiner.json".source = config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
}
