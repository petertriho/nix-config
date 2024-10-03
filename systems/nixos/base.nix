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
  nix.settings.auto-optimise-store = true;

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

  time.timeZone = "Australia/Sydney";

  system.stateVersion = lib.mkDefault "24.05";
}
