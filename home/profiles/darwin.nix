{ config, ... }:
{
  imports = [
    ./base.nix
    # ../programs/alacritty.nix
    ../programs/ghostty.nix
    # ../programs/colima.nix
    # ../programs/wezterm.nix
  ];

  home.file.".hushlogin".text = "";

  xdg.configFile = {
    "aerospace".source = config.lib.meta.mkDotfilesSymlink "aerospace/.config/aerospace";
    # "karabiner/karabiner.json".source =
    #   config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
  };
}
