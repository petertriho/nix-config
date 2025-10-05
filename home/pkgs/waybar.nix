{ ... }:
{
  programs.waybar = {
    enable = true;
    systemd.enable = false;
    settings = {
      mainBar = {
        layer = "top";
        position = "top";
        height = 30;
        spacing = 4;
        modules-left = [ "hyprland/workspaces" ];
        modules-center = [ "clock" ];
        modules-right = [
          "tray"
          "cpu"
          "memory"
          "temperature"
          "backlight"
          "pulseaudio"
          "battery"
          "network"
        ];

        "hyprland/workspaces" = {
          disable-scroll = true;
          all-outputs = true;
          format = "{name}: {windows}";
          format-window-separator = " ";
          window-rewrite-default = "󰘔";
          window-rewrite = {
            "alacritty" = "󰆍";
            "chromium" = "󰊯";
            "discord" = "󰙯";
            "firefox" = "󰈹";
            "google-chrome" = "󰊯";
            "kitty" = "󰄛";
            "nautilus" = "󰉋";
            "org.kde.dolphin" = "󰉋";
            "slack" = "󰒱";
            "thunar" = "󰉋";
            "wezterm" = "󰆍";
          };
        };

        "hyprland/window" = {
          max-length = 50;
        };

        "network" = {
          format-wifi = "{icon}";
          format-ethernet = "{icon}";
          format-linked = "{icon}";
          format-disconnected = "{icon}";
          format-icons = {
            wifi = [
              "󰤯"
              "󰤟"
              "󰤢"
              "󰤥"
              "󰤨"
            ];
            ethernet = "󰈀";
            linked = "󰌷";
            disconnected = "󰌙";
          };
          tooltip-format-wifi = "{icon} {essid}\nSignal: {signalStrength}%\nFrequency: {frequency}MHz";
          tooltip-format-linked = "{icon} {ifname} (No IP)";
          tooltip-format-ethernet = "{icon} {ifname}\nIP: {ipaddr}/{cidr}";
        };

        "pulseaudio" = {
          format = "{icon}";
          format-bluetooth = "󰂯 {icon}";
          format-muted = "󰝟";
          format-icons = {
            headphone = "󰋋";
            hands-free = "󱡏";
            headset = "󰋎";
            phone = "󰏲";
            portable = "󰦢";
            car = "󰄋";
            default = [
              "󰕿"
              "󰖀"
              "󰕾"
            ];
          };
          on-click = "pwvucontrol";
          tooltip-format = "Volume: {volume}%";
        };

        "battery" = {
          states = {
            warning = 30;
            critical = 15;
          };
          format = "{icon} {capacity}%";
          format-charging = "󰂄 {capacity}%";
          format-plugged = "󰚥 {capacity}%";
          format-alt = "{icon} {time}";
          format-icons = [
            "󰁺"
            "󰁻"
            "󰁼"
            "󰁽"
            "󰁾"
            "󰁿"
            "󰂀"
            "󰂁"
            "󰂂"
            "󰁹"
          ];
          tooltip-format = "Battery: {capacity}%\nTime: {time}";
        };

        "cpu" = {
          format = "󰍛 {usage}%";
          tooltip = true;
        };

        "memory" = {
          format = "󰾆 {used:0.1f}G";
          tooltip-format = "Memory: {used:0.1f}GB/{total:0.1f}GB ({percentage}%)";
        };

        "temperature" = {
          critical-threshold = 80;
          format = "{icon} {temperatureC}°C";
          format-icons = [
            "󰜗"
            "󱃃"
            "󰸁"
          ];
        };

        "backlight" = {
          format = "{icon}";
          format-icons = [
            "󰃞"
            "󰃟"
            "󰃠"
          ];
          on-scroll-up = "brightnessctl set +5%";
          on-scroll-down = "brightnessctl set 5%-";
          tooltip-format = "Brightness: {percent}%";
        };

        "tray" = {
          icon-size = 21;
          spacing = 10;
        };

        "clock" = {
          format = "{:%Y-%m-%d %H:%M}";
          tooltip-format = "<tt>{calendar}</tt>";
        };
      };
    };

    style = ''
      * {
        border: none;
        border-radius: 0;
        font-family: "JetBrainsMono Nerd Font Propo", monospace;
        font-size: 13px;
        min-height: 0;
      }

      window#waybar {
        background-color: rgba(0, 0, 0, 0.5);
        color: #ffffff;
      }

      #workspaces button {
        padding: 0 5px;
        background-color: transparent;
        color: #ffffff;
        border-bottom: 3px solid transparent;
      }

      #workspaces button:hover {
        background: rgba(0, 0, 0, 0.2);
      }

      #workspaces button.active {
        background-color: rgba(255, 255, 255, 0.1);
        border-bottom: 1px solid #ffffff;
      }

      #workspaces button.urgent {
        background-color: #eb4d4b;
      }

      #window,
      #cpu,
      #memory,
      #temperature,
      #backlight,
      #network,
      #pulseaudio,
      #battery,
      #clock {
        padding: 0 2px;
        margin: 0 2px;
        color: #ffffff;
      }

      #battery.critical:not(.charging) {
        background-color: #f53c3c;
        color: #ffffff;
        animation-name: blink;
        animation-duration: 0.5s;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
        animation-direction: alternate;
      }

      @keyframes blink {
        to {
          background-color: #ffffff;
          color: #000000;
        }
      }
    '';
  };
}
