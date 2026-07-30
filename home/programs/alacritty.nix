{
  pkgs,
  lib,
  ...
}:
{
  programs.alacritty = {
    enable = lib.mkIf pkgs.stdenv.isLinux true;
    settings = {
      window = {
        option_as_alt = "Both";
      };
      colors = {
        draw_bold_text_with_bright_colors = true;
      };
    };
  };

  targets.darwin.defaults = lib.mkIf pkgs.stdenv.isDarwin {
    "org.alacritty" = {
      AppleFontSmoothing = 0;
    };
  };
}
