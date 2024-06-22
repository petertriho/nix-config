{
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    ./pkgs/bat
    ./pkgs/fish
    ./pkgs/gh
    ./pkgs/neovim
    ./pkgs/tmux
    ./pkgs/vivid
  ];

  home = {
    username = "peter";
    homeDirectory = "/home/peter";
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
      set_theme = lib.hm.dag.entryAfter [ "installPackages" ] ''
        PATH="${pkgs.fish}/bin:${pkgs.vivid}/bin:$PATH" run fish -c "set_theme"
      '';
    };
  };

  programs.home-manager.enable = true;
}
