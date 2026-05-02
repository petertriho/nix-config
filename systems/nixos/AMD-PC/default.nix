{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
  ];

  networking.hostName = "AMD-PC";

  system.stateVersion = "25.11";
}
