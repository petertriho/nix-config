{
  inputs,
  pkgs,
  config,
  ...
}:
{
  home.packages = with pkgs; [
    brightnessctl
    grimblast
    pamixer
    tofi
  ];

  wayland.windowManager.hyprland = {
    enable = true;
    package = inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.hyprland;
    systemd.enable = false;
    settings = {
      animations = {
        enabled = false;
      };

      exec-once = [
        "waybar"
      ];

      general = {
        gaps_in = 0;
        gaps_out = 0;
      };

      input = {
        touchpad = {
          natural_scroll = true;
          scroll_factor = 0.5;
        };
      };

      misc = {
        disable_splash_rendering = true;
        force_default_wallpaper = 0;
      };

      "$mod" = "SUPER";
      "$browser" = "firefox";
      "$terminal" = "alacritty";
      "$fileManager" = "dolphin";
      "$menu" = "wofi --show drun";

      bind = [
        ", Print, exec, grimblast copy area"

        ", XF86AudioMute, exec, pamixer --toggle-mute"
        ", XF86AudioLowerVolume, exec, pamixer --decrease 5"
        ", XF86AudioRaiseVolume, exec, pamixer --increase 5"
        ", XF86MonBrightnessDown, exec, brightnessctl set 5%-"
        ", XF86MonBrightnessUp, exec, brightnessctl set 5%+"

        "$mod, RETURN, exec, $terminal"
        "$mod, SPACE, exec, $menu"
        "$mod SHIFT, SPACE, exec, ${config.home.homeDirectory}/.local/bin/wofi-switch-to-window"
        "$mod, B, exec, $browser"
        "$mod, E, exec, $fileManager"

        "$mod, F, togglefloating"
        "$mod, Q, killactive"
        "$mod, Z, fullscreen"
        "$mod SHIFT, Q, exit"

        "$mod, H, movefocus, l"
        "$mod, L, movefocus, r"
        "$mod, J, movefocus, d"
        "$mod, K, movefocus, u"
      ]
      ++ (
        # workspaces
        # binds $mod + [shift +] {1..9} to [move to] workspace {1..9}
        builtins.concatLists (
          builtins.genList (
            i:
            let
              ws = i + 1;
            in
            [
              "$mod, ${toString ws}, workspace, ${toString ws}"
              "$mod SHIFT, ${toString ws}, movetoworkspace, ${toString ws}"
            ]
          ) 9
        )
        ++ [
          "$mod, 0, workspace, 10"
          "$mod SHIFT, 0, movetoworkspace, 10"
        ]
      );
      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];
    };
  };
  home.sessionVariables.NIXOS_OZONE_WSL = "1";
}
