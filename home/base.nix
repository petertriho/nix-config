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
    username = "peter";
    homeDirectory = "/home/peter";
    stateVersion = lib.mkDefault "24.05";
    activation = {
      set_theme = lib.hm.dag.entryAfter [ "installPackages" ] ''
        PATH="${pkgs.fish}/bin:${pkgs.vivid}/bin:$PATH" run fish -c "set_theme"
      '';
    };
  };

  programs.home-manager.enable = true;
}
