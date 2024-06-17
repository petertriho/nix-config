{
  config,
  pkgs,
  ...
}: {
  imports = [./common.nix];

  home.stateVersion = "24.05";
}
