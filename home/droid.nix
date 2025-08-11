{
  outputs,
  lib,
  user,
  homePath,
  ...
}:
{
  home = {
    username = user;
    homeDirectory = homePath;
    stateVersion = lib.mkDefault "24.05";
  };

  programs.home-manager.enable = true;
}
