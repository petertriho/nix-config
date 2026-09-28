{
  lib,
  pkgs,
  ...
}:
{
  imports = [
    ../desktop
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
}
