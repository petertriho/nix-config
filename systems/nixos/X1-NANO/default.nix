{
  inputs,
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
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-x1-nano-gen1
  ];

  system.stateVersion = "25.11";
}
