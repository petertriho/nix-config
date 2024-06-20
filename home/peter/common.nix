{
  config,
  pkgs,
  ...
}: {
  imports = [
    ./packages/neovim
    ./packages/tmux
  ];

  home = {
    username = "peter";
    homeDirectory = "/home/peter";
    packages = with pkgs; [
      alejandra
      eza
      fzf
      gh
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
