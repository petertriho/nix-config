{
  config,
  pkgs,
  lib,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
  luaString = value: builtins.toJSON value;
in
{
  home.packages =
    with pkgs;
    lib.mkIf pkgs.stdenv.hostPlatform.isLinux [
      wezterm
    ];
  xdg.configFile = {
    "wezterm".source = config.lib.meta.mkDotfilesSymlink "wezterm/.config/wezterm";
    "stylix/wezterm.lua".text = ''
      local wezterm = require("wezterm")

      return {
          config = {
              colors = {
                  foreground = ${luaString colors.base05},
                  background = ${luaString colors.base00},
                  cursor_fg = ${luaString colors.base00},
                  cursor_bg = ${luaString colors.base05},
                  cursor_border = ${luaString colors.base05},
                  selection_fg = ${luaString colors.base05},
                  selection_bg = ${luaString colors.base02},
                  ansi = {
                      ${luaString colors.base10},
                      ${luaString colors.base08},
                      ${luaString colors.base0B},
                      ${luaString colors.base0A},
                      ${luaString colors.base0D},
                      ${luaString colors.base0E},
                      ${luaString colors.base0C},
                      ${luaString colors.base05},
                  },
                  brights = {
                      ${luaString colors.base03},
                      ${luaString colors.base12},
                      ${luaString colors.base14},
                      ${luaString colors.base13},
                      ${luaString colors.base16},
                      ${luaString colors.base17},
                      ${luaString colors.base15},
                      ${luaString colors.base07},
                  },
                  tab_bar = {
                      background = ${luaString colors.base00},
                      active_tab = {
                          bg_color = ${luaString colors.base01},
                          fg_color = ${luaString colors.base05},
                      },
                      inactive_tab = {
                          bg_color = ${luaString colors.base00},
                          fg_color = ${luaString colors.base03},
                      },
                      inactive_tab_hover = {
                          bg_color = ${luaString colors.base00},
                          fg_color = ${luaString colors.base05},
                      },
                      new_tab = {
                          bg_color = ${luaString colors.base00},
                          fg_color = ${luaString colors.base03},
                      },
                      new_tab_hover = {
                          bg_color = ${luaString colors.base00},
                          fg_color = ${luaString colors.base05},
                      },
                  },
              },
              font = wezterm.font(${luaString config.stylix.fonts.monospace.name}),
              font_size = wezterm.target_triple == "x86_64-pc-windows-msvc" and 12 or 14,
              window_background_opacity = ${toString config.stylix.opacity.terminal},
          },
          active_marker = ${luaString colors.base0D},
          active_text = ${luaString colors.base05},
      }
    '';
  };
}
