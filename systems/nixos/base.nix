{
  config,
  lib,
  ...
}:
{
  imports = [
    ../base.nix
  ];

  nix.gc.dates = "weekly";

  users.users.${config.user} = {
    isNormalUser = true;
    extraGroups = [
      "docker"
      "wheel"
    ];
  };

  virtualisation = {
    docker = {
      enable = true;
      autoPrune = {
        enable = true;
        dates = "weekly";
      };
    };
  };

  system.stateVersion = lib.mkDefault "24.05";
}
