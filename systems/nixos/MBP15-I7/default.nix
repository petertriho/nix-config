{ inputs, pkgs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    inputs.nixos-hardware.nixosModules.apple-t2
  ];
  hardware = {
    enableRedistributableFirmware = true;
    apple-t2 = {
      firmware.enable = true;
      firmware.version = "sonoma";
      kernelChannel = "stable";
      # Keep the Radeon Pro 560X as the primary GPU for first boot.
      enableIGPU = false;
    };
  };

  security.wrappers.intel_gpu_top = {
    source = "${pkgs.intel-gpu-tools}/bin/intel_gpu_top";
    capabilities = "cap_perfmon+ep";
    owner = "root";
    group = "root";
  };

  environment.systemPackages = with pkgs; [
    intel-gpu-tools
    radeontop
  ];

  system.stateVersion = "25.11";
}
