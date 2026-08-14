{
  pkgs,
  lib,
  ...
}:
{
  programs.alacritty = {
    enable = lib.mkIf pkgs.stdenv.hostPlatform.isLinux true;
    settings = {
      window = {
        option_as_alt = "Both";
      };
      colors = {
        draw_bold_text_with_bright_colors = true;
      };
    };
  };

  targets.darwin.defaults = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    "org.alacritty" = {
      AppleFontSmoothing = 0;
    };
  };
}
