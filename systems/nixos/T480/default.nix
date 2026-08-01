{
  inputs,
  lib,
  pkgs,
  ...
}:
{
  nixpkgs.overlays = [ inputs.auto-cpufreq.overlays.default ];
  systemd.services.auto-cpufreq.path = [ pkgs.gawk ];

  imports = [
    ../desktop
    # ./fingerprint.nix
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

  services.upower.enable = true;
  services.throttled.enable = lib.mkForce false;

  specialisation = {
    powersave.configuration = {
      system.nixos.tags = [ "powersave" ];
      disabledModules = [ ./nvidia.nix ];
    };
  };

  system.stateVersion = "25.11";
}
