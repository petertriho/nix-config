{
  outputs,
  lib,
  user,
  homePath,
  ...
}:
{
  imports = [
    outputs.homeManagerModules.helpers
    ./pkgs/ai.nix
    ./pkgs/data.nix
    ./pkgs/devops.nix
    ./pkgs/direnv.nix
    ./pkgs/fish.nix
    ./pkgs/git.nix
    ./pkgs/neovim.nix
    ./pkgs/scripts.nix
    ./pkgs/starship.nix
    ./pkgs/tmux.nix
    ./pkgs/tools.nix
  ];

  home = {
    username = user;
    homeDirectory = homePath;
    stateVersion = lib.mkDefault "24.05";
  };

  programs.home-manager.enable = true;
}
