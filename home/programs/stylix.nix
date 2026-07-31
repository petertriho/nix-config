{ config, ... }:
let
  colors = config.lib.stylix.colors.withHashtag;
in
{
  home.sessionVariables = {
    IRIS_THEME_BORDER = colors.base0D;
    IRIS_THEME_ACCENT = colors.base0B;
    IRIS_THEME_MUTED = colors.base03;
    IRIS_THEME_TEXT = colors.base05;
    IRIS_THEME_SELECTED_TEXT = colors.base07;
    IRIS_THEME_MATCH = colors.base0C;
    IRIS_THEME_DESCRIPTION = colors.base04;
    IRIS_THEME_SELECTED_DESCRIPTION = colors.base06;
    IRIS_THEME_SELECTED_BACKGROUND = colors.base02;
    IRIS_THEME_SCROLL_INFO = colors.base0D;
    IRIS_THEME_GHOST_TEXT = colors.base03;
  };

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
