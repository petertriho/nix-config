{
  outputs,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    outputs.homeManagerModules.helpers
    ./pkgs/bat.nix
    ./pkgs/devenv.nix
    ./pkgs/devops.nix
    ./pkgs/direnv.nix
    ./pkgs/fish.nix
    ./pkgs/gh.nix
    ./pkgs/git.nix
    ./pkgs/neovim.nix
    ./pkgs/scripts.nix
    ./pkgs/starship.nix
    ./pkgs/tmux.nix
    ./pkgs/tools.nix
    ./pkgs/vivid.nix
    ./pkgs/yazi.nix
  ];

  home = {
    username = outputs.options.user;
    homeDirectory = lib.strings.concatStrings [
      (if pkgs.stdenv.isLinux then "/home/" else "/Users/")
      outputs.options.user
    ];
    stateVersion = lib.mkDefault "24.05";
  };

  programs.home-manager.enable = true;
}
