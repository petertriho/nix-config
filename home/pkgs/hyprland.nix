{
  inputs,
  pkgs,
  ...
}:
{
  home = {
    packages = with pkgs; [
      brightnessctl
      grimblast
      hypridle
      pamixer
      playerctl
      qt5.qtwayland
      qt6.qtwayland
    ];
    sessionVariables.NIXOS_OZONE_WSL = "1";
  };

  programs.hyprlock = {
    enable = true;
  };

  services.hypridle = {
    enable = true;
    settings = {
      general = {
        lock_cmd = "pidof hyprlock || hyprlock";
        before_sleep_cmd = "loginctl lock-session";
        after_sleep_cmd = "hyprctl dispatch dpms on";
      };

      listener = [
        {
          timeout = 300;
          on-timeout = "loginctl lock-session";
        }
        {
          timeout = 330;
          on-timeout = "hyprctl dispatch dpms off";
          on-resume = "hyprctl dispatch dpms on";
        }
      ];
    };
  };

  wayland.windowManager.hyprland = {
    enable = true;
    package = inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.hyprland;
    systemd.enable = false;
    settings = {
      windowrule = [
        "float, title:^(quickshell-osd)$"
        "noborder, title:^(quickshell-osd)$"
        "noshadow, title:^(quickshell-osd)$"
        "pin, title:^(quickshell-osd)$"
        "workspace special, title:^(quickshell-osd)$"
        "opacity 0.0 override, class:^(xwaylandvideobridge)$"
        "noanim, class:^(xwaylandvideobridge)$"
        "noinitialfocus, class:^(xwaylandvideobridge)$"
        "maxsize 1 1, class:^(xwaylandvideobridge)$"
        "noblur, class:^(xwaylandvideobridge)$"
      ];

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

      decoration = {
        blur = {
          enabled = false;
        };
        shadow = {
          enabled = false;
        };
      };

      misc = {
        disable_splash_rendering = true;
        force_default_wallpaper = 0;
      };

      "$mod" = "SUPER";
      "$browser" = "floorp";
      "$terminal" = "ghostty";
      "$fileManager" = "dolphin";
      "$menu" = "vicinae vicinae://toggle";
      "$menuApp" = "vicinae vicinae://extensions/vicinae/applications";
      "$menuClip" = "vicinae vicinae://extensions/vicinae/clipboard/history";
      "$menuWin" = "vicinae vicinae://extensions/vicinae/wm/switch-windows";

      bind = [
        # System/Hardware Keys
        ", Print, exec, grimblast copy area"
        ", XF86AudioMute, global, quickshell-osd:volume-mute"
        ", XF86AudioLowerVolume, global, quickshell-osd:volume-down"
        ", XF86AudioRaiseVolume, global, quickshell-osd:volume-up"
        ", XF86MonBrightnessDown, global, quickshell-osd:brightness-down"
        ", XF86MonBrightnessUp, global, quickshell-osd:brightness-up"
        ", XF86AudioPlay, exec, playerctl play-pause"
        ", XF86AudioPrev, exec, playerctl previous"
        ", XF86AudioNext, exec, playerctl next"

        # System Actions
        "$mod, Escape, exec, hyprlock"
        "$mod SHIFT, Escape, exec, uwsm stop"

        # Launch
        "$mod, Space, exec, $menu"
        "$mod, Return, exec, $terminal"
        "$mod, F, exec, $fileManager"
        "$mod, T, exec, $browser"
        "$mod, V, exec, $menuClip"

        # Window: Misc
        "$mod, Tab, cyclenext"
        "$mod SHIFT, Tab, cyclenext, prev"
        "$mod, Q, killactive"
        "$mod, M, fullscreen, 1"
        "$mod, Z, fullscreen, 0"

        # Window: Focus
        "$mod, H, movefocus, l"
        "$mod, J, movefocus, d"
        "$mod, K, movefocus, u"
        "$mod, L, movefocus, r"
        "$mod, Left, movefocus, l"
        "$mod, Down, movefocus, d"
        "$mod, Up, movefocus, u"
        "$mod, Right, movefocus, r"

        # Window: Move
        "$mod SHIFT, H, movewindow, l"
        "$mod SHIFT, J, movewindow, d"
        "$mod SHIFT, K, movewindow, u"
        "$mod SHIFT, L, movewindow, r"
        "$mod SHIFT, Left, movewindow, l"
        "$mod SHIFT, Down, movewindow, d"
        "$mod SHIFT, Up, movewindow, u"
        "$mod SHIFT, Right, movewindow, r"

        # Workspace: Focus
        "$mod, N, workspace, e+1"
        "$mod, P, workspace, e-1"
        "$mod, 0, workspace, previous"

        # Workspace: Move Window
        "$mod SHIFT, N, movetoworkspace, e+1"
        "$mod SHIFT, P, movetoworkspace, e-1"

        # Monitor: Focus
        "$mod ALT, H, focusmonitor, l"
        "$mod ALT, J, focusmonitor, d"
        "$mod ALT, K, focusmonitor, u"
        "$mod ALT, L, focusmonitor, r"
        "$mod ALT, Left, focusmonitor, l"
        "$mod ALT, Down, focusmonitor, d"
        "$mod ALT, Up, focusmonitor, u"
        "$mod ALT, Right, focusmonitor, r"

        # Monitor: Move Window
        "$mod SHIFT ALT, H, movewindow, mon:l"
        "$mod SHIFT ALT, J, movewindow, mon:d"
        "$mod SHIFT ALT, K, movewindow, mon:u"
        "$mod SHIFT ALT, L, movewindow, mon:r"
        "$mod SHIFT ALT, Left, movewindow, mon:l"
        "$mod SHIFT ALT, Down, movewindow, mon:d"
        "$mod SHIFT ALT, Up, movewindow, mon:u"
        "$mod SHIFT ALT, Right, movewindow, mon:r"

        # Submaps
        "$mod, R, submap, resize"
        "$mod, W, submap, window"
      ]
      ++ (
        # Workspaces
        # Focus: Super + 1-9
        # Move Window: Super + Shift + 1-9
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
            ", H, resizeactive, -50 0"
            "$mod, H, resizeactive, -50 0"

            ", L, resizeactive, 50 0"
            "$mod, L, resizeactive, 50 0"

            ", K, resizeactive, 0 -50"
            "$mod, K, resizeactive, 0 -50"

            ", J, resizeactive, 0 50"
            "$mod, J, resizeactive, 0 50"

            ", Left, resizeactive, -50 0"
            "$mod, Left, resizeactive, -50 0"

            ", Right, resizeactive, 50 0"
            "$mod, Right, resizeactive, 50 0"

            ", Up, resizeactive, 0 -50"
            "$mod, Up, resizeactive, 0 -50"

            ", Down, resizeactive, 0 50"
            "$mod, Down, resizeactive, 0 50"

            ", Equal, resizeactive, exact"
            "$mod, Equal, resizeactive, exact"
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

            ", F, togglefloating"
            ", F, submap, reset"
            "$mod, F, togglefloating"
            "$mod, F, submap, reset"

            ", M, fullscreen, 1"
            ", M, submap, reset"
            "$mod, M, fullscreen, 1"
            "$mod, M, submap, reset"

            ", Q, killactive"
            ", Q, submap, reset"
            "$mod, Q, killactive"
            "$mod, Q, submap, reset"

            ", W, exec, $menuWin"
            ", W, submap, reset"
            "$mod, W, exec, $menuWin"
            "$mod, W, submap, reset"

            ", X, swapnext"
            ", X, submap, reset"
            "$mod, X, swapnext"
            "$mod, X, submap, reset"

            ", Y, pseudo"
            ", Y, submap, reset"
            "$mod, Y, pseudo"
            "$mod, Y, submap, reset"

            ", Z, fullscreen, 0"
            ", Z, submap, reset"
            "$mod, Z, fullscreen, 0"
            "$mod, Z, submap, reset"
          ];
        };
      };
    };
  };
}
