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
    ../programs/stylix-desktop.nix
    ../programs/alacritty.nix
    ../programs/ghostty.nix
    ../programs/wayland-common.nix
    ../programs/niri.nix
    ../programs/quickshell.nix
    ../programs/ripgrep-all.nix
    ../programs/vicinae.nix
  ];

  home.packages = with pkgs; [
    jellyfin-mpv-shim
    libreoffice
    nextcloud-client
    tabularis
    thunderbird
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
    firefox = {
      enable = true;
      package = pkgs.firefox.override {
        extraPrefsFiles = [ config.programs.betterfox.extraPrefsFile ];
        # Sync applies an incoming pref only if the local device has its
        # control pref, so every synced device needs this.
        extraPrefs = ''
          defaultPref("services.sync.prefs.sync.browser.uiCustomization.state", true);
        '';
      };
      policies = {
        DisableAppUpdate = true;
      };
    };
    chromium = {
      enable = true;
      package = pkgs.ungoogled-chromium;
      # ungoogled-chromium strips Web Store support. chromium-web-store
      # restores "Add to Chromium", and needs the flag to accept CRX installs.
      commandLineArgs = [ "--extension-mime-request-handling=always-prompt-for-install" ];
      # ungoogled-chromium does not install external extensions from an
      # external_update_url, so pin the CRX instead.
      extensions = with pkgs.chromeExtensions; [
        { inherit (chromium-web-store) id version crxPath; }
      ];
    };
  };

  gtk = {
    enable = true;
    gtk2.enable = false;
  };

  programs.zathura.enable = true;

  dconf.settings = {
    "org/gnome/desktop/interface" = {
      color-scheme = if config.stylix.polarity == "dark" then "prefer-dark" else "default";
    };
    # KillSwitch soft-blocks rfkill when the adapter is unpowered at login. On
    # ThinkPads that removes hci0, so the Quickshell bar finds no adapter.
    "org/blueman/general" = {
      plugin-list = [ "!KillSwitch" ];
    };
  };

  xdg.configFile."mimeapps.list".source =
    config.lib.meta.mkDotfilesSymlink "mimeapps/.config/mimeapps.list";
}
