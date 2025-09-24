{ config, ... }:
{
  imports = [
    ./base.nix
    ./pkgs/alacritty.nix
    ./pkgs/ghostty.nix
    ./pkgs/colima.nix
    ./pkgs/wezterm.nix
  ];

  home.file.".hushlogin".text = "";

  xdg.configFile = {
    "aerospace".source = config.lib.meta.mkDotfilesSymlink "aerospace/.config/aerospace";
    # "karabiner/karabiner.json".source =
    #   config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
  };
}
