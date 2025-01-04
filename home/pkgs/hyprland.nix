{
  inputs,
  pkgs,
  ...
}:
{
  wayland.windowManager.hyprland = {
    enable = true;
    package = inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.hyprland;
    systemd.enable = true;
    settings = {
      "$mod" = "SUPER";
      "$browser" = "firefox";
      "$terminal" = "wezterm";
      "$fileManager" = "dolphin";
      "$menu" = "wofi --show drun";

      bind =
        [
          ", Print, exec, grimblast copy area"

          "$mod, RETURN, exec, $terminal"
          "$mod, B, exec, $browser"
          "$mod, E, exec, $fileManager"

          "$mod, F, togglefloating"
          "$mod, Q, killactive"
          "$mod, Z, fullscreen"
          "$mod SHIFT, Q, exit"

          "$mod, H, movefocus, l"
          "$mod, L, movefocus, r"
          "$mod, J, movefocus, u"
          "$mod, K, movefocus, d"
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
