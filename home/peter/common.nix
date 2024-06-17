{
  config,
  pkgs,
  ...
}: {
  imports = [
    ./packages/neovim
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
      ripgrep
      tmux
      unzip
      yq-go
      zip
    ];
  };

  programs.home-manager.enable = true;
}
