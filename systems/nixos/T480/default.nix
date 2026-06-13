{ inputs, pkgs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./nvidia.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-t480
  ];
  security.wrappers.intel_gpu_top = {
    source = "${pkgs.intel-gpu-tools}/bin/intel_gpu_top";
    capabilities = "cap_perfmon+ep";
    owner = "root";
    group = "root";
  };

  specialisation = {
    powersave.configuration = {
      system.nixos.tags = [ "powersave" ];
      disabledModules = [ ./nvidia.nix ];
    };
  };

  system.stateVersion = "25.11";
}
