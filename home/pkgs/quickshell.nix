{
  config,
  pkgs,
  inputs,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
in
{
  home.packages = [
    inputs.quickshell.packages.${pkgs.stdenv.hostPlatform.system}.default
    pkgs.codexbar
  ];

  xdg.configFile = {
    "quickshell".source = config.lib.meta.mkDotfilesSymlink "quickshell/.config/quickshell";
    "stylix/quickshell-theme.qml".text = ''
      import QtQuick

      QtObject {
          readonly property QtObject colors: QtObject {
              readonly property string bg: "${colors.base01}"
              readonly property string bg_dark: "${colors.base01}"
              readonly property string bg_dark1: "${colors.base11}"
              readonly property string bg_highlight: "${colors.base02}"
              readonly property string blue: "${colors.base0D}"
              readonly property string border: "${colors.base10}"
              readonly property string border_highlight: "${colors.base0C}"
              readonly property string comment: "${colors.base04}"
              readonly property string dark3: "${colors.base04}"
              readonly property string fg: "${colors.base05}"
              readonly property string fg_float: "${colors.base06}"
              readonly property string green: "${colors.base0B}"
              readonly property string magenta: "${colors.base0E}"
              readonly property string red: "${colors.base08}"
              readonly property string warning: "${colors.base0A}"
              readonly property string yellow: "${colors.base0A}"
          }

          readonly property QtObject fonts: QtObject {
              readonly property string defaultFamily: "JetBrainsMono Nerd Font Propo"
              readonly property int defaultSize: 14
              readonly property int workspaceSize: 12
              readonly property int workspaceIconSize: 12
          }

          readonly property QtObject osd: QtObject {
              readonly property real opacity: 0.9
              readonly property int titleFontSize: 16
              readonly property int valueFontSize: 14
              readonly property string mutedProgressColor: "${colors.base12}"
          }

          readonly property QtObject notifications: QtObject {
              readonly property int summaryFontSize: 14
              readonly property int appFontSize: 11
              readonly property int bodyFontSize: 12
              readonly property int actionFontSize: 11
              readonly property int headerFontSize: 16
              readonly property real panelOpacity: 0.96
          }
      }
    '';
  };

  systemd.user.services.quickshell = {
    Unit = {
      Description = "Quickshell";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
    };

    Install = {
      WantedBy = [ "graphical-session.target" ];
    };

    Service = {
      ExecStart = "${
        inputs.quickshell.packages.${pkgs.stdenv.hostPlatform.system}.default
      }/bin/quickshell";
      Restart = "always";
      RestartSec = 5;
    };
  };
}
