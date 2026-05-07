{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./lg-buddy.nix
  ];

  networking.hostName = "AMD-PC";

  system.stateVersion = "25.11";
}
