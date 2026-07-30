{ config, ... }:
{
  stylix.targets = {
    bat.enable = true;
    btop.enable = true;
    fish = {
      enable = true;
      colors.override = config.lib.stylix.colors.override {
        base04 = config.lib.stylix.colors.base05;
      };
    };
    fzf.enable = true;
    gitui.enable = true;
    lazygit.enable = true;
    opencode.enable = true;
    starship.enable = true;
    vivid = {
      enable = true;
      colors.override = config.lib.stylix.colors.override {
        base0F = config.lib.stylix.colors.base0D;
      };
    };
    yazi.enable = true;

    neovim.enable = false;
    tmux.enable = false;
    ghostty.enable = false;
    wezterm.enable = false;
    vim.enable = false;
    firefox.enable = false;
    floorp.enable = false;
  };
}
