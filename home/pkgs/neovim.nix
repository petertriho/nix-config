{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    neovim
    stylua
  ];

  xdg.configFile."nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
  xdg.configFile."code".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/code";
}
