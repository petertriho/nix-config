/*
  TODO:
  - [ ] switch out waybar for hyprpanel?
  - [ ] look into other hypr plugins
  - [ ] set up lockscreen to auto lock after idle timeout
*/
{
  inputs,
  pkgs,
  ...
}:
{
  home.packages = with pkgs; [
    brightnessctl
    grimblast
    pamixer
    playerctl
    hyprlock
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
          tap-to-click = true;
          tap-and-drag = true;
          disable_while_typing = true;
        };
      };

      misc = {
        disable_splash_rendering = true;
        force_default_wallpaper = 0;
      };

      "$mod" = "SUPER";
      "$browser" = "floorp";
      "$terminal" = "alacritty";
      "$fileManager" = "dolphin";
      "$menu" = "vicinae vicinae://toggle";
      "$menuApp" = "vicinae vicinae://extensions/vicinae/applications";
      "$menuClip" = "vicinae vicinae://extensions/vicinae/clipboard/history";
      "$menuWin" = "vicinae vicinae://extensions/vicinae/wm/switch-windows";

      bind = [
        # System/Hardware Keys
        ", Print, exec, grimblast copy area"
        ", XF86AudioMute, exec, pamixer --toggle-mute"
        ", XF86AudioLowerVolume, exec, pamixer --decrease 5"
        ", XF86AudioRaiseVolume, exec, pamixer --increase 5"
        ", XF86MonBrightnessDown, exec, brightnessctl set 5%-"
        ", XF86MonBrightnessUp, exec, brightnessctl set 5%+"
        ", XF86AudioPlay, exec, playerctl play-pause"
        ", XF86AudioPrev, exec, playerctl previous"
        ", XF86AudioNext, exec, playerctl next"

        # System Actions
        "$mod, Escape, exec, hyprlock"
        "$mod SHIFT, Escape, exec, uwsm stop"

        # Application launchers
        "$mod, slash, exec, $menu"
        "$mod, SPACE, exec, $menu"
        "$mod, B, exec, $browser"
        "$mod, F, exec, $fileManager"
        "$mod, T, exec, $terminal"
        "$mod, V, exec, $menuClip"

        # Move focus
        "$mod, H, movefocus, l"
        "$mod, J, movefocus, d"
        "$mod, K, movefocus, u"
        "$mod, L, movefocus, r"
        "$mod, Left, movefocus, l"
        "$mod, Down, movefocus, d"
        "$mod, Up, movefocus, u"
        "$mod, Right, movefocus, r"

        # Move window
        "$mod SHIFT, H, movewindow, l"
        "$mod SHIFT, J, movewindow, d"
        "$mod SHIFT, K, movewindow, u"
        "$mod SHIFT, L, movewindow, r"
        "$mod SHIFT, Left, movewindow, l"
        "$mod SHIFT, Down, movewindow, d"
        "$mod SHIFT, Up, movewindow, u"
        "$mod SHIFT, Right, movewindow, r"

        # Workspace navigation
        "$mod, N, workspace, e+1" # Next workspace
        "$mod, P, workspace, e-1" # Previous workspace

        # Move window to workspace
        "$mod SHIFT, N, movetoworkspace, e+1"
        "$mod SHIFT, P, movetoworkspace, e-1"

        # Monitor/Output switching
        "$mod ALT, H, focusmonitor, l"
        "$mod ALT, J, focusmonitor, d"
        "$mod ALT, K, focusmonitor, u"
        "$mod ALT, L, focusmonitor, r"
        "$mod ALT, Left, focusmonitor, l"
        "$mod ALT, Down, focusmonitor, d"
        "$mod ALT, Up, focusmonitor, u"
        "$mod ALT, Right, focusmonitor, r"

        # Move window to monitor
        "$mod SHIFT ALT, H, movewindow, mon:l"
        "$mod SHIFT ALT, J, movewindow, mon:d"
        "$mod SHIFT ALT, K, movewindow, mon:u"
        "$mod SHIFT ALT, L, movewindow, mon:r"
        "$mod SHIFT ALT, Left, movewindow, mon:l"
        "$mod SHIFT ALT, Down, movewindow, mon:d"
        "$mod SHIFT ALT, Up, movewindow, mon:u"
        "$mod SHIFT ALT, Right, movewindow, mon:r"

        # Window switching
        "$mod, Tab, cyclenext"
        "$mod SHIFT, Tab, cyclenext, prev"

        # Submaps
        "$mod, R, submap, resize"
        "$mod, W, submap, window"
      ]
      ++ (
        # Workspaces - COSMIC style
        # Super + 1-9 to switch to workspace, Super + 0 for last workspace
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
          # Super + 0 maps to "last workspace" in COSMIC
          "$mod, 0, workspace, previous" # Last workspace
          "$mod SHIFT, 0, movetoworkspace, previous" # Move to last workspace
        ]
      );
      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];

      gesture = [
        "3, horizontal, workspace"
        "3, vertical, fullscreen"
        "4, up, dispatcher, exec, $menuWin"
        "4, down, dispatcher, exec, $menuApp"
      ];
    };

    submaps = {
      resize = {
        settings = {
          binde = [
            "$mod, H, resizeactive, -50 0"
            "$mod, L, resizeactive, 50 0"
            "$mod, K, resizeactive, 0 -50"
            "$mod, J, resizeactive, 0 50"
            "$mod, Left, resizeactive, -50 0"
            "$mod, Right, resizeactive, 50 0"
            "$mod, Up, resizeactive, 0 -50"
            "$mod, Down, resizeactive, 0 50"
            ", H, resizeactive, -50 0"
            ", L, resizeactive, 50 0"
            ", K, resizeactive, 0 -50"
            ", J, resizeactive, 0 50"
            ", Left, resizeactive, -50 0"
            ", Right, resizeactive, 50 0"
            ", Up, resizeactive, 0 -50"
            ", Down, resizeactive, 0 50"
          ];
          bind = [
            ", Escape, submap, reset"
            ", Return, submap, reset"
          ];
        };
      };
      window = {
        settings = {
          bind = [
            ", Escape, submap, reset"
            ", Return, submap, reset"
            "$mod, F, submap, reset"
            "$mod, F, togglefloating"
            "$mod, M, fullscreen, 1"
            "$mod, M, submap, reset"
            "$mod, Q, killactive"
            "$mod, Q, submap, reset"
            "$mod, W, exec, $menuWin"
            "$mod, W, submap, reset"
            "$mod, X, submap, reset"
            "$mod, X, swapnext"
            "$mod, Y, pseudo"
            "$mod, Y, submap, reset"
            "$mod, Z, fullscreen, 0"
            "$mod, Z, submap, reset"
            ", F, submap, reset"
            ", F, togglefloating"
            ", M, fullscreen, 1"
            ", M, submap, reset"
            ", Q, killactive"
            ", Q, submap, reset"
            ", W, exec, $menuWin"
            ", W, submap, reset"
            ", X, submap, reset"
            ", X, swapnext"
            ", Y, pseudo"
            ", Y, submap, reset"
            ", Z, fullscreen, 0"
            ", Z, submap, reset"
          ];
        };
      };
    };
  };
  home.sessionVariables.NIXOS_OZONE_WSL = "1";
}
