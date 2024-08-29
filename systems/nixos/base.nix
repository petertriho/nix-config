{
  inputs,
  config,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    inputs.home-manager.nixosModules.home-manager
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

  users.users.peter = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };

  system.stateVersion = lib.mkDefault "24.05";
}
