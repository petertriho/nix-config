{
  outputs,
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    outputs.homeManagerModules.helpers
    ./pkgs/bat
    ./pkgs/fish
    ./pkgs/gh
    ./pkgs/neovim
    ./pkgs/scripts
    ./pkgs/tmux
    ./pkgs/vivid
  ];

  home = {
    username = "peter";
    homeDirectory = "/home/peter";
    stateVersion = lib.mkDefault "24.05";
    packages = with pkgs; [
      alejandra
      eza
      fd
      fzf
      git
      glow
      iperf3
      jq
      nurl
      ripgrep
      unzip
      yq-go
      zip
    ];
    activation = {
      set_theme = lib.hm.dag.entryAfter ["installPackages"] ''
        PATH="${pkgs.fish}/bin:${pkgs.vivid}/bin:$PATH" run fish -c "set_theme"
      '';
    };
  };

  programs.home-manager.enable = true;
}
