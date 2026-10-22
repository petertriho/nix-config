{ inputs, pkgs, ... }:
{
  imports = [
    inputs.vicinae.nixosModules.default
    ../base.nix
    ../modules/desktop-environment
    ../modules/kanata.nix
    ./audio.nix
    ./bluetooth.nix
    ./bootloader.nix
    ./networking.nix
    # inputs.nix-flatpak.nixosModules.nix-flatpak
  ];

  services = {
    # Discover printers with `ippfind` or at http://localhost:631/admin after rebuilding.
    avahi = {
      enable = true;
      nssmdns4 = true;
      openFirewall = true;
    };
    # flatpak = {
    #   enable = true;
    #   remotes = [
    #     {
    #       name = "flathub";
    #       location = "https://dl.flathub.org/repo/flathub.flatpakrepo";
    #     }
    #   ];
    #   packages = [ ];
    # };
    fwupd.enable = true;
    printing = {
      enable = true;
      drivers = [ pkgs.cups-brother-mfc9335cdw ];
    };
  };

  # openresolv sends SIGHUP to the PID in /run/avahi-daemon/pid. A SIGHUP during
  # startup kills avahi and leaves the file, which the hardened unit cannot remove.
  systemd.services.avahi-daemon.serviceConfig.ExecStartPre =
    "+${pkgs.coreutils}/bin/rm -f /run/avahi-daemon/pid";

  programs.vicinae.input-server.package = pkgs.vicinae;
}
