{
  inputs,
  lib,
  pkgs,
  ...
}:
{
  # auto-cpufreq retired in favor of TLP. Kept for reference.
  # nixpkgs.overlays = [ inputs.auto-cpufreq.overlays.default ];
  # systemd.services.auto-cpufreq.path = [ pkgs.gawk ];

  imports = [
    ../desktop
    # ./fingerprint.nix
    ./hardware-configuration.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-x1-nano-gen1
  ];
  # Radio off at boot, enable on demand via blueman. Overrides desktop default.
  hardware.bluetooth.powerOnBoot = lib.mkForce false;

  # Manual measurement tools for validating drain: `sudo powertop`,
  # `powerstat -d 0 60`, `intel_gpu_top`.
  environment.systemPackages = with pkgs; [
    powerstat
    powertop
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
