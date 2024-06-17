{
  inputs,
  outputs,
  ...
}: {
  imports = [
    ../common
    inputs.nixos-wsl.nixosModules.wsl
  ];

  wsl.enable = true;
  wsl.defaultUser = "peter";
  networking.hostName = "wsl";

  system.stateVersion = "23.11";
}
