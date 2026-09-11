{ pkgs, ... }: {
  imports = [
    ./greetd.nix
    ./i18n.nix
    ./niri.nix
  ];
  services = {
    desktopManager = {
      gnome.enable = false;
      plasma6.enable = false;
      cosmic.enable = false;
    };
    xserver = {
      enable = false;
      xkb = {
        layout = "au";
        variant = "";
      };
    };
  };

  services.gnome.gnome-keyring.enable = true;
  services.gvfs.enable = true;

  # security.pam.services.login.enableGnomeKeyring = true;

  fonts.packages = with pkgs; [
    nerd-fonts.jetbrains-mono
  ];

  environment.systemPackages = with pkgs; [
    baobab # disk usage analyzer
    dconf-editor # graphical dconf settings editor
    evince # document/PDF viewer
    file-roller # archive manager
    gnome-calculator # calculator
    gnome-disk-utility # disk and partition manager
    loupe # image viewer
    nautilus # file manager
    nautilus-python # python bindings for nautilus
    networkmanagerapplet # NetworkManager tray applet
    pwvucontrol # PipeWire volume control
    seahorse # GNOME keyring/password manager
  ];

  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
  };
}
