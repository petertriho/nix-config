{
  lib,
  pkgs,
  inputs,
  ...
}:
{
  nixpkgs.overlays = [
    # niri-flake still requires libdisplay-info 0.2 (its make-niri has a
    # callPackage parameter literally named `libdisplay-info_0_2`), but current
    # nixpkgs removed it (pkgs/top-level/aliases.nix throws). Restore a real
    # 0.2.0 build from the older pinned nixpkgs-unstable so niri's callPackage
    # finds it. Drop this overlay once niri-flake stops referencing
    # libdisplay-info_0_2 (upstream has flagged it as "working on it").
    (final: _prev: {
      libdisplay-info_0_2 =
        inputs.nixpkgs-unstable.legacyPackages.${final.stdenv.hostPlatform.system}.libdisplay-info_0_2;
    })
    inputs.niri.overlays.niri
  ];

  programs.niri = {
    enable = true;
    package = pkgs.niri-unstable;
  };

  xdg.portal = {
    enable = true;
    config.niri = {
      default = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Access" = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Notification" = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Settings" = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Secret" = lib.mkForce [ "gnome-keyring" ];
    };
    extraPortals = lib.mkForce [
      pkgs.xdg-desktop-portal-gtk
      pkgs.gnome-keyring
    ];
  };

  security.pam.services.hyprlock = { };
}
