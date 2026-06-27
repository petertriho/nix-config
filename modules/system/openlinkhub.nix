{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.openlinkhub;
  stateDir = "/var/lib/openlinkhub";
  assetsDir = "${cfg.package}/opt/OpenLinkHub";
in
{
  options.services.openlinkhub = {
    enable = lib.mkEnableOption "OpenLinkHub";

    package = lib.mkPackageOption pkgs "openlinkhub" { };
  };

  config = lib.mkIf cfg.enable {
    users.users.openlinkhub = {
      isSystemUser = true;
      group = "openlinkhub";
      home = stateDir;
    };
    users.groups.openlinkhub = { };

    services.udev.packages = [ cfg.package ];

    systemd.services.openlinkhub = {
      after = [ "sleep.target" ];
      wantedBy = [ "multi-user.target" ];

      unitConfig = {
        StartLimitIntervalSec = 60;
        StartLimitBurst = 5;
      };

      serviceConfig = {
        User = "openlinkhub";
        Group = "openlinkhub";
        StateDirectory = "openlinkhub";
        # Web UI listens on http://localhost:27003
        WorkingDirectory = stateDir;
        ExecStart = "${cfg.package}/bin/OpenLinkHub";
        Restart = "always";
        RestartSec = 5;
      };

      preStart = # sh
        ''
          ln -sfn ${assetsDir}/static ${stateDir}/static
          ln -sfn ${assetsDir}/web ${stateDir}/web
          if [ ! -e ${stateDir}/database ]; then
            cp -r ${assetsDir}/database ${stateDir}/database
          fi
          # Seed perms: nix-store files are read-only, OpenLinkHub must write profiles/rgb.json.
          chmod -R u+rwX ${stateDir}/database
        '';
    };
  };
}
