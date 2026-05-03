{
  inputs,
  pkgs,
  config,
  ...
}:
{
  imports = [
    ./base.nix
    inputs.vicinae.homeManagerModules.default
    ./pkgs/alacritty.nix
    ./pkgs/ghostty.nix
    ./pkgs/wayland-common.nix
    ./pkgs/hyprland.nix
    ./pkgs/niri.nix
    ./pkgs/quickshell.nix
    ./pkgs/vicinae.nix
  ];
  home.packages = with pkgs; [
    discord
    floorp-bin
    libreoffice
    nextcloud-client
    steam
    thunderbird
    ungoogled-chromium
  ];
  programs.claude-code.zai.enable = true;

  gtk = {
    enable = true;
    theme = {
      name = "Adwaita-dark";
      package = pkgs.gnome-themes-extra;
    };
    gtk4.theme = config.gtk.theme;
  };

  dconf.settings = {
    "org/gnome/desktop/interface" = {
      color-scheme = "prefer-dark";
    };
  };

  xdg.configFile."mimeapps.list".source =
    config.lib.meta.mkDotfilesSymlink "mimeapps/.config/mimeapps.list";
}
