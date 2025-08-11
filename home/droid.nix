{
  outputs,
  lib,
  user,
  homePath,
  pkgs,
  ...
}:
{
  home = {
    username = user;
    homeDirectory = homePath;
    stateVersion = lib.mkDefault "24.05";
  };

  programs.home-manager.enable = true;

  home.packages = with pkgs; [
    gh
  ];
}
