{
  inputs,
  config,
  lib,
  pkgs,
  ...
}:
{
  imports = [
    ./base.nix
    inputs.nixos-wsl.nixosModules.wsl
  ];

  wsl = {
    enable = true;
    defaultUser = config.user;
  };
  networking.hostName = "WSL";
}
