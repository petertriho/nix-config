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
    ../programs/stylix.nix
    ../programs/ai.nix
    ../programs/cli-proxy-api.nix
    ../programs/data.nix
    ../programs/devops.nix
    ../programs/direnv.nix
    ../programs/fish.nix
    ../programs/git.nix
    ../programs/neovim.nix
    ../programs/scripts.nix
    ../programs/starship.nix
    ../programs/tmux.nix
    ../programs/tools.nix
    ../programs/yazi.nix
  ];

  home = {
    username = user;
    homeDirectory = homePath;
    stateVersion = lib.mkDefault "26.05";
  };

  programs.home-manager.enable = true;
  programs.iris.enable = false;
}
