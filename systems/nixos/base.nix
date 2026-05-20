{
  inputs,
  config,
  lib,
  pkgs,
  ...
}:
{
  imports = [
    ../base
    inputs.home-manager.nixosModules.home-manager
  ];

  nix.gc.dates = "weekly";
  nix.settings.auto-optimise-store = true;

  security.sudo.extraConfig = ''
    Defaults pwfeedback
    Defaults timestamp_timeout=60
    Defaults timestamp_type=tty
  '';

  users.users.${config.user} = {
    isNormalUser = true;
    extraGroups = [
      "dialout"
      "docker"
      "wheel"
    ];
  };

  programs.nix-ld = {
    enable = true;
    libraries = with pkgs; [ ];
  };

  virtualisation = {
    docker = {
      enable = true;
      enableOnBoot = false;
      autoPrune = {
        enable = true;
        dates = "weekly";
      };
    };
  };

  time.timeZone = "Australia/Sydney";

  system.stateVersion = lib.mkDefault "25.11";
}
