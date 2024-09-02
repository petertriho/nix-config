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
  nix.settings.trusted-users = [
    "root"
    "@wheel"
  ];

  users.users.${config.user} = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };

  system.stateVersion = lib.mkDefault "24.05";
}
