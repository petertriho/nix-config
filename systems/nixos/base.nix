{
  config,
  pkgs,
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

  programs.bash = {
    interactiveShellInit = config.lib.meta.interactiveShellInit pkgs;
  };

  users.users.${config.user} = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };

  system.stateVersion = lib.mkDefault "24.05";
}
