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
    playerctl
    swaylock-effects
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
      "$menu" = "tofi-drun --drun-launch=true";

      bind = [
        # System/Hardware keys
        ", Print, exec, grimblast copy area"
        ", XF86AudioMute, exec, pamixer --toggle-mute"
        ", XF86AudioLowerVolume, exec, pamixer --decrease 5"
        ", XF86AudioRaiseVolume, exec, pamixer --increase 5"
        ", XF86MonBrightnessDown, exec, brightnessctl set 5%-"
        ", XF86MonBrightnessUp, exec, brightnessctl set 5%+"
        ", XF86AudioPlay, exec, playerctl play-pause"
        ", XF86AudioPrev, exec, playerctl previous"
        ", XF86AudioNext, exec, playerctl next"

        # System actions
        "$mod, Escape, exec, swaylock" # Lock screen
        "$mod SHIFT, Escape, exit" # Logout
        "$mod ALT, Escape, exit" # Terminate (mapped to exit)

        # Application launchers
        "$mod, T, exec, $terminal"
        "$mod, slash, exec, $menu" # Launcher
        "$mod, SPACE, exec, $menu" # Alt launcher binding
        "$mod SHIFT, SPACE, exec, ${config.home.homeDirectory}/.local/bin/tofi-switch-to-window"
        "$mod, B, exec, $browser" # Web browser
        "$mod, F, exec, $fileManager" # Home folder/File manager
        "$mod, A, exec, $menu" # App library (mapped to menu)

        # Window management
        "$mod, Q, killactive" # Close window
        "$mod, G, togglefloating" # Toggle floating
        "$mod, M, fullscreen, 1" # Maximize
        "$mod, F11, fullscreen, 0" # True fullscreen
        "$mod, Y, pseudo" # Toggle tiling (pseudo-tiling in Hyprland)
        "$mod, X, swapnext" # Swap window

        # Focus management
        "$mod, H, movefocus, l" # Focus left
        "$mod, J, movefocus, d" # Focus down
        "$mod, K, movefocus, u" # Focus up
        "$mod, L, movefocus, r" # Focus right
        "$mod, Left, movefocus, l"
        "$mod, Down, movefocus, d"
        "$mod, Up, movefocus, u"
        "$mod, Right, movefocus, r"

        # Move windows
        "$mod SHIFT, H, movewindow, l" # Move left
        "$mod SHIFT, J, movewindow, d" # Move down
        "$mod SHIFT, K, movewindow, u" # Move up
        "$mod SHIFT, L, movewindow, r" # Move right
        "$mod SHIFT, Left, movewindow, l"
        "$mod SHIFT, Down, movewindow, d"
        "$mod SHIFT, Up, movewindow, u"
        "$mod SHIFT, Right, movewindow, r"

        # Workspace navigation
        "$mod CONTROL, H, workspace, e-1" # Previous workspace
        "$mod CONTROL, L, workspace, e+1" # Next workspace
        "$mod CONTROL, Left, workspace, e-1"
        "$mod CONTROL, Right, workspace, e+1"
        "$mod CONTROL, Up, workspace, e-1"
        "$mod CONTROL, Down, workspace, e+1"
        "$mod CONTROL, J, workspace, e+1"
        "$mod CONTROL, K, workspace, e-1"

        # Move window to workspace
        "$mod SHIFT CONTROL, H, movetoworkspace, e-1" # Move to previous workspace
        "$mod SHIFT CONTROL, L, movetoworkspace, e+1" # Move to next workspace
        "$mod SHIFT CONTROL, Left, movetoworkspace, e-1"
        "$mod SHIFT CONTROL, Right, movetoworkspace, e+1"
        "$mod SHIFT CONTROL, Up, movetoworkspace, e-1"
        "$mod SHIFT CONTROL, Down, movetoworkspace, e+1"
        "$mod SHIFT CONTROL, J, movetoworkspace, e+1"
        "$mod SHIFT CONTROL, K, movetoworkspace, e-1"

        # Monitor/Output switching
        "$mod ALT, H, focusmonitor, l" # Switch to left monitor
        "$mod ALT, J, focusmonitor, d" # Switch to down monitor
        "$mod ALT, K, focusmonitor, u" # Switch to up monitor
        "$mod ALT, L, focusmonitor, r" # Switch to right monitor
        "$mod ALT, Left, focusmonitor, l"
        "$mod ALT, Down, focusmonitor, d"
        "$mod ALT, Up, focusmonitor, u"
        "$mod ALT, Right, focusmonitor, r"

        # Move window to monitor
        "$mod SHIFT ALT, H, movewindow, mon:l" # Move window to left monitor
        "$mod SHIFT ALT, J, movewindow, mon:d" # Move window to down monitor
        "$mod SHIFT ALT, K, movewindow, mon:u" # Move window to up monitor
        "$mod SHIFT ALT, L, movewindow, mon:r" # Move window to right monitor
        "$mod SHIFT ALT, Left, movewindow, mon:l"
        "$mod SHIFT ALT, Down, movewindow, mon:d"
        "$mod SHIFT ALT, Up, movewindow, mon:u"
        "$mod SHIFT ALT, Right, movewindow, mon:r"

        # Window switching
        "ALT, Tab, cyclenext"
        "ALT SHIFT, Tab, cyclenext, prev"
        "$mod, Tab, cyclenext"
        "$mod SHIFT, Tab, cyclenext, prev"

        # Zoom (not directly supported in Hyprland, but can use scaling)
        "$mod, equal, exec, hyprctl keyword misc:cursor_zoom_factor 1.5"
        "$mod, minus, exec, hyprctl keyword misc:cursor_zoom_factor 1.0"
        "$mod, period, exec, hyprctl keyword misc:cursor_zoom_factor 1.5"
        "$mod, comma, exec, hyprctl keyword misc:cursor_zoom_factor 1.0"

        # Workspace overview (using a workspace switcher if available)
        "$mod, W, exec, ${config.home.homeDirectory}/.local/bin/tofi-switch-to-window"

        # Submap: resize
        "$mod, R, submap, resize"
        "$mod SHIFT, R, submap, resize"
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
    };

    submaps = {
      resize = {
        settings = {
          binde = [
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
    };
  };
  home.sessionVariables.NIXOS_OZONE_WSL = "1";
}
