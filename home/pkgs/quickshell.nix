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

          readonly property QtObject osd: QtObject {
              readonly property real opacity: 0.9
              readonly property int titleFontSize: 16
              readonly property int valueFontSize: 14
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
