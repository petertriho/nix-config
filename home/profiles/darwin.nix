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

  # The Homebrew cask installs the app, so Nix manages only the skills.
  programs.orca = {
    enable = true;
    package = null;
  };

  xdg.configFile = {
    "aerospace".source = config.lib.meta.mkDotfilesSymlink "aerospace/.config/aerospace";
    "glide".source = config.lib.meta.mkDotfilesSymlink "glide/.config/glide";
    # "karabiner/karabiner.json".source =
    #   config.lib.meta.mkDotfilesSymlink "karabiner/.config/karabiner/karabiner.json";
  };
}
