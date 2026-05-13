{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./lg-buddy.nix
  ];

  networking.hostName = "AMD-PC";

  services.input-remapper.enable = true;

  system.stateVersion = "25.11";
}
