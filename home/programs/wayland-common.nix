{ config, pkgs, ... }:
let
  colors = config.lib.stylix.colors;
  # hyprlock parses rgb(R, G, B) cleanly; its 0x hex is alpha-first
  # (0xAARRGGBB) and mangles 6-digit values into the wrong channels, so build
  # rgb() from stylix's per-channel decimal accessors (base0X-rgb-r/g/b).
  rgb =
    n:
    "rgb(${builtins.getAttr (n + "-rgb-r") colors}, ${builtins.getAttr (n + "-rgb-g") colors}, ${
      builtins.getAttr (n + "-rgb-b") colors
    })";
  font = config.stylix.fonts.sansSerif.name;

  # stylix palette baked at build time (withHashtag → "#rrggbb")
  cGood = colors.withHashtag.base0B; # green  ≥60%
  cMid = colors.withHashtag.base0A; # yellow 40-59%
  cLow = colors.withHashtag.base09; # orange 20-39%
  cCrit = colors.withHashtag.base08; # red    <20%
  cChg = colors.withHashtag.base0D; # blue   charging

  batteryScript = pkgs.writeShellScript "hyprlock-battery" ''
    # Aggregate all BAT* cells into one capacity-weighted percentage.
    total_full=0; total_now=0; charging=0
    for b in /sys/class/power_supply/BAT*; do
      [ -e "$b" ] || continue
      if [ -r "$b/energy_full" ] && [ -r "$b/energy_now" ]; then
        total_full=$((total_full + $(cat "$b/energy_full")))
        total_now=$((total_now + $(cat "$b/energy_now")))
      elif [ -r "$b/capacity" ]; then
        total_full=$((total_full + 100))
        total_now=$((total_now + $(cat "$b/capacity")))
      fi
      [ "$(cat "$b/status" 2>/dev/null)" = Charging ] && charging=1
    done
    [ "$total_full" -gt 0 ] || exit 0 # no battery → label blank
    pct=$((total_now * 100 / total_full))

    # Discrete color tier (+ charging override).
    if [ "$charging" = 1 ]; then color="${cChg}"; glyph="󰂄"
    elif [ "$pct" -ge 60 ]; then color="${cGood}"; glyph="󰁹"
    elif [ "$pct" -ge 40 ]; then color="${cMid}"; glyph="󰁹"
    elif [ "$pct" -ge 20 ]; then color="${cLow}"; glyph="󰁹"
    else color="${cCrit}"; glyph="󰁹"
    fi

    # Pango markup; single '#' is fine (script output, not hyprlock.conf).
    printf '<span foreground="%s">%s %d%%</span>' "$color" "$glyph" "$pct"
  '';
in
{
  home = {
    packages = with pkgs; [
      brightnessctl
      cliphist
      grim
      libnotify
      pamixer
      playerctl
      qt5.qtwayland
      qt6.qtwayland
      slurp
      wl-clipboard-rs
      xdg-terminal-exec
    ];
    sessionVariables.NIXOS_OZONE_WL = "1";
  };

  programs.fuzzel.enable = true;

  programs.hyprlock = {
    enable = true;
    settings = {
      general = {
        hide_cursor = true;
        no_fade_in = false;
      };

      background = [
        {
          monitor = "";
          path = "color";
          color = rgb "base00";
        }
      ];

      label = [
        # Time — built-in $TIME, large, centered, above middle
        {
          monitor = "";
          text = "$TIME";
          color = rgb "base06";
          font_size = 110;
          font_family = font;
          position = "0, 140";
          halign = "center";
          valign = "center";
        }
        # Date — below the time
        {
          monitor = "";
          text = "cmd[update:60000] date '+%A %d %B'";
          color = rgb "base04";
          font_size = 24;
          font_family = font;
          position = "0, 40";
          halign = "center";
          valign = "center";
        }
        # Battery — top-right corner; empty on hosts without BAT*
        {
          monitor = "";
          text = "cmd[update:5000] ${batteryScript}";
          color = rgb "base04";
          font_size = 16;
          font_family = font;
          position = "-40, -40";
          halign = "right";
          valign = "top";
        }
      ];

      input-field = [
        {
          monitor = "";
          size = "300, 50";
          outline_thickness = 2;
          dots_spacing = 0.2;
          dots_center = true;
          fade_on_empty = false;
          outer_color = rgb "base0D";
          inner_color = rgb "base01";
          font_color = rgb "base05";
          placeholder_text = "";
          fail_text = "<i>$FAIL ($ATTEMPTS)</i>";
          position = "0, -80";
          halign = "center";
          valign = "center";
        }
      ];
    };
  };

  services.hypridle = {
    enable = true;
    settings = {
      general = {
        lock_cmd = "pidof hyprlock || hyprlock";
        before_sleep_cmd = "loginctl lock-session";
        after_sleep_cmd = "${pkgs.niri-unstable}/bin/niri msg action power-on-monitors";
      };

      listener = [
        {
          timeout = 300;
          on-timeout = "loginctl lock-session";
        }
        {
          timeout = 330;
          on-timeout = "${pkgs.niri-unstable}/bin/niri msg action power-off-monitors";
          on-resume = "${pkgs.niri-unstable}/bin/niri msg action power-on-monitors";
        }
      ];
    };
  };

  systemd.user.services.hyprpolkitagent = {
    Unit = {
      Description = "Polkit authentication agent";
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
