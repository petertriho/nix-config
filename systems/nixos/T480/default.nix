{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./nvidia.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-t480
  ];

  networking.hostName = "T480";

  specialisation = {
    powersave.configuration = {
      system.nixos.tags = [ "powersave" ];
      disabledModules = [ ./nvidia.nix ];
      imports = [
        ../desktop
        ./hardware-configuration.nix
        inputs.nixos-hardware.nixosModules.lenovo-thinkpad-t480
      ];
    };
  };

  system.stateVersion = "24.11";
}
