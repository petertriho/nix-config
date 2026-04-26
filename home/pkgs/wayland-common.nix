{ pkgs, ... }:
{
  home = {
    packages = with pkgs; [
      brightnessctl
      cliphist
      fuzzel
      grim
      pamixer
      playerctl
      qt5.qtwayland
      qt6.qtwayland
      slurp
      wl-clipboard
      xdg-terminal-exec
    ];
    sessionVariables.NIXOS_OZONE_WL = "1";
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

  systemd.user.services.hyprpolkitagent = {
    Unit = {
      Description = "Hyprland Polkit authentication agent";
      PartOf = [ "graphical-session.target" ];
      After = [ "graphical-session.target" ];
      ConditionEnvironment = "WAYLAND_DISPLAY";
    };
    Service = {
      ExecStart = "${pkgs.hyprpolkitagent}/libexec/hyprpolkitagent";
      Restart = "on-failure";
    };
    Install.WantedBy = [ "graphical-session.target" ];
  };
}
