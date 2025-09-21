{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-x1-nano-gen1
  ];

  networking.hostName = "X1-NANO";

  system.stateVersion = "24.11";
}
