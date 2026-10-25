{ lib, pkgs, ... }: {
  imports = [
    ./greetd.nix
    ./i18n.nix
    ./keymods.nix
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

  # Every profile stays installed so apps outside Nix can use any of them.
  fonts.packages = lib.unique (
    lib.concatMap (profile: [
      profile.monospace.package
      profile.sansSerif.package
    ]) (lib.attrValues (import ../../../base/font-profiles.nix { inherit pkgs; }))
  );

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
