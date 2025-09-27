{ config, pkgs, inputs, ... }:
{
  home.packages = [ inputs.quickshell.packages.${pkgs.system}.default ];

  xdg.configFile."quickshell".source = config.lib.meta.mkDotfilesSymlink "quickshell/.config/quickshell";

  systemd.user.services.quickshell = {
    Unit = {
      Description = "Quickshell";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
    };

    Service = {
      ExecStart = "${inputs.quickshell.packages.${pkgs.system}.default}/bin/quickshell";
      Restart = "always";
      RestartSec = 5;
    };

    Install = {
      WantedBy = [ "graphical-session.target" ];
    };
  };
}
