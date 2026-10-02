{
  inputs,
  lib,
  ...
}:
{
  # auto-cpufreq retired in favor of TLP. Kept for reference.
  # nixpkgs.overlays = [ inputs.auto-cpufreq.overlays.default ];
  # systemd.services.auto-cpufreq.path = [ pkgs.gawk ];

  imports = [
    ../laptop
    # ./fingerprint.nix
    ./hardware-configuration.nix
    ./nvidia.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-t480
  ];

  # GCC 16 rejects this runtime's incomplete-type SFINAE pattern.
  nixpkgs.overlays = [
    (final: prev: {
      intel-compute-runtime-legacy1 = prev.intel-compute-runtime-legacy1.override {
        stdenv = prev.gcc15Stdenv;
      };
    })
  ];

  services.throttled.enable = lib.mkForce false;

  specialisation = {
    powersave.configuration = {
      system.nixos.tags = [ "powersave" ];
      disabledModules = [ ./nvidia.nix ];
    };
  };

  system.stateVersion = "25.11";
}
