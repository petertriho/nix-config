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
    outputs.homeManagerModules.programs
    ./pkgs/ai.nix
    ./pkgs/cli-proxy-api.nix
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
    ./pkgs/yazi.nix
  ];

  home = {
    username = user;
    homeDirectory = homePath;
    stateVersion = lib.mkDefault "26.05";
  };

  programs.home-manager.enable = true;
}
