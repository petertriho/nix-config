{
  config,
  pkgs,
  ...
}: {
  imports = [
    ./pkgs/bat
    ./pkgs/gh
    ./pkgs/neovim
    ./pkgs/tmux
  ];

  home = {
    username = "peter";
    homeDirectory = "/home/peter";
    packages = with pkgs; [
      alejandra
      eza
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
  };

  programs.home-manager.enable = true;
}
