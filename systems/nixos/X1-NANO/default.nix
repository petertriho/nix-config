{ inputs, pkgs, ... }:
{
  nixpkgs.overlays = [ inputs.auto-cpufreq.overlays.default ];
  systemd.services.auto-cpufreq.path = [ pkgs.gawk ];

  imports = [
    ../desktop
    # ./fingerprint.nix
    ./hardware-configuration.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-x1-nano-gen1
  ];
  security.wrappers.intel_gpu_top = {
    source = "${pkgs.intel-gpu-tools}/bin/intel_gpu_top";
    capabilities = "cap_perfmon+ep";
    owner = "root";
    group = "root";
  };

  services.upower.enable = true;

  system.stateVersion = "25.11";
}
