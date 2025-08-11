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
    ./pkgs/bat.nix
    ./pkgs/data.nix
    ./pkgs/devops.nix
    ./pkgs/direnv.nix
    ./pkgs/fish.nix
    ./pkgs/gh.nix
    ./pkgs/git.nix
    ./pkgs/k8s.nix
    ./pkgs/neovim.nix
    ./pkgs/scripts.nix
    ./pkgs/starship.nix
    ./pkgs/tmux.nix
    ./pkgs/tools.nix
    ./pkgs/vivid.nix
  ];

  home = {
    username = user;
    homeDirectory = homePath;
    stateVersion = lib.mkDefault "24.05";
  };

  programs.home-manager.enable = true;
}
