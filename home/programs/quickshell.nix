{
  config,
  pkgs,
  inputs,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
  quickshell = inputs.quickshell.packages.${pkgs.stdenv.hostPlatform.system}.default;

  # Quickshell picks its network backend only at start, so it waits up to 30 s
  # for NetworkManager on the system bus. At boot the bus name is already there:
  # NetworkManager is Type=dbus and orders before network.target, which orders
  # before the login. `nixos-rebuild switch` can stop NetworkManager and start it
  # again only after Home Manager has restarted this unit. So the wait is in
  # ExecStart and not in ExecStartPre, so that the start job does not wait for it.
  #
  # After a timeout, Quickshell starts without the backend, so that the bar
  # shows. A waiter stays in the background and restarts the unit when
  # NetworkManager is back. It is in the cgroup of the unit, so it stops with it.
  quickshellStart = pkgs.writeShellScript "quickshell-start" ''
    wait_nm() {
      ${pkgs.glib.bin}/bin/gdbus wait --system "$@" org.freedesktop.NetworkManager
    }

    if ! wait_nm --timeout 30; then
      echo "NetworkManager is not on the system bus. Quickshell restarts when it is." >&2
      (wait_nm && exec ${config.systemd.user.systemctlPath} --user --no-block restart quickshell.service) &
    fi
    exec ${quickshell}/bin/quickshell --no-detailed-logs
  '';
in
{
  home.packages = [
    quickshell
    pkgs.codexbar
  ];

  xdg.configFile = {
    "quickshell".source = config.lib.meta.mkDotfilesSymlink "quickshell/.config/quickshell";
    "stylix/quickshell-theme.qml".text = ''
      import QtQuick

      QtObject {
          readonly property QtObject colors: QtObject {
              readonly property string base00: "${colors.base00}"
              readonly property string base01: "${colors.base01}"
              readonly property string base02: "${colors.base02}"
              readonly property string base03: "${colors.base03}"
              readonly property string base04: "${colors.base04}"
              readonly property string base05: "${colors.base05}"
              readonly property string base06: "${colors.base06}"
              readonly property string base07: "${colors.base07}"
              readonly property string base08: "${colors.base08}"
              readonly property string base09: "${colors.base09}"
              readonly property string base0A: "${colors.base0A}"
              readonly property string base0B: "${colors.base0B}"
              readonly property string base0C: "${colors.base0C}"
              readonly property string base0D: "${colors.base0D}"
              readonly property string base0E: "${colors.base0E}"
              readonly property string base0F: "${colors.base0F}"
              readonly property string base10: "${colors.base10}"
              readonly property string base11: "${colors.base11}"
              readonly property string base12: "${colors.base12}"
              readonly property string base13: "${colors.base13}"
              readonly property string base14: "${colors.base14}"
              readonly property string base15: "${colors.base15}"
              readonly property string base16: "${colors.base16}"
              readonly property string base17: "${colors.base17}"
          }

          readonly property QtObject fonts: QtObject {
              readonly property string defaultFamily: "JetBrainsMono Nerd Font Propo"
              readonly property int defaultSize: 14
              readonly property int workspaceSize: 12
              readonly property int workspaceIconSize: 12
          }

          readonly property QtObject notifications: QtObject {
              readonly property int summaryFontSize: 14
              readonly property int appFontSize: 11
              readonly property int bodyFontSize: 12
              readonly property int actionFontSize: 11
              readonly property int headerFontSize: 16
          }
      }
    '';
  };

  systemd.user.services.quickshell = {
    Unit = {
      Description = "Quickshell";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
      StartLimitIntervalSec = 120;
      StartLimitBurst = 5;
    };

    Install = {
      WantedBy = [ "graphical-session.target" ];
    };

    Service = {
      ExecStart = "${quickshellStart}";
      SyslogIdentifier = "quickshell";
      Restart = "on-failure";
      RestartSec = 5;
      RestartSteps = 4;
      RestartMaxDelaySec = 30;
    };
  };
}
