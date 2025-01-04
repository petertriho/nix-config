{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-t480
  ];

  networking.hostName = "T480";

  system.stateVersion = "24.11";
}
