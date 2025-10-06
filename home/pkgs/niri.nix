{
  inputs,
  pkgs,
  ...
}:
{
  imports = [
    inputs.niri.homeModules.niri
  ];

  home = {
    packages = with pkgs; [
      brightnessctl
      grim
      fuzzel
      slurp
      pamixer
      playerctl
      qt5.qtwayland
      qt6.qtwayland
      niriswitcher
      wl-clipboard
    ];
    sessionVariables.NIXOS_OZONE_WL = "1";
  };

  programs.niri = {
    enable = true;
    package = pkgs.niri-unstable;
    settings = {
      input = {
        keyboard = {
          xkb.layout = "us";
          numlock = true;
        };
        touchpad = {
          tap = true;
          natural-scroll = true;
          drag = true;
        };
        # focus-follows-mouse.max-scroll-amount = "0%";
      };

      layout = {
        gaps = 8;
        center-focused-column = "on-overflow";
        preset-column-widths = [
          { proportion = 0.33333; }
          { proportion = 0.5; }
          { proportion = 0.66667; }
        ];
        default-column-width.proportion = 0.5;
      };

      # spawn-at-startup = [ { command = [ "waybar" ]; } ];

      prefer-no-csd = true;

      screenshot-path = "~/Pictures/Screenshots/Screenshot from %Y-%m-%d %H-%M-%S.png";
    };
  };

  programs.niriswitcher = {
    enable = true;
  };
}
