{
  pkgs,
  lib,
  ...
}:
{
  home.packages =
    with pkgs;
    lib.mkIf pkgs.stdenv.isLinux [
      alacritty
    ];

  programs.alacritty = {
    enable = true;
    settings = {
      font = {
        size = if pkgs.stdenv.isLinux then 12 else 14;
        normal.family = "JetBrainsMono Nerd Font Mono";
      };
      window = {
        option_as_alt = "Both";
      };
      colors = {
        primary = {
          foreground = "#c0caf5";
          background = "#1a1b26";
        };
        cursor = {
          text = "#1a1b26";
          cursor = "#c0caf5";
        };
        selection = {
          text = "#c0caf5";
          background = "#33467c";
        };
        normal = {
          black = "#15161e";
          red = "#f7768e";
          green = "#9ece6a";
          yellow = "#e0af68";
          blue = "#7aa2f7";
          magenta = "#bb9af7";
          cyan = "#7dcfff";
          white = "#a9b1d6";
        };
        bright = {
          black = "#414868";
          red = "#ff899d";
          green = "#9fe044";
          yellow = "#faba4a";
          blue = "#8db0ff";
          magenta = "#c7a9ff";
          cyan = "#a4daff";
          white = "#c0caf5";
        };
      };
    };
  };

  targets.darwin.defaults = lib.mkIf pkgs.stdenv.isDarwin {
    "org.alacritty" = {
      AppleFontSmoothing = 0;
    };
  };
}
