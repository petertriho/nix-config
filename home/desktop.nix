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
    ./pkgs/niri.nix
    ./pkgs/quickshell.nix
    ./pkgs/ripgrep-all.nix
    ./pkgs/vicinae.nix
  ];

  home.packages = with pkgs; [
    jellyfin-mpv-shim
    libreoffice
    nextcloud-client
    tabularis
    thunderbird
    zathura
  ];

  programs = {
    betterfox = {
      enable = true;
      browserPackage = pkgs.floorp-bin.unwrapped;
      configs = {
        userjs = true;
        securefox = true;
        peskyfox = true;
        smoothfox = "natural";
      };
      extraPreferences = {
        "media.ffmpeg.vaapi.enabled" = true;
        "media.hardware-video-decoding.force-enabled" = true;
        "media.av1.enabled" = false;
      };
    };
    chromium = {
      enable = true;
      package = pkgs.ungoogled-chromium;
    };
    claude-code.zai.enable = true;
  };

  gtk = {
    enable = true;
    gtk2.enable = false;
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
