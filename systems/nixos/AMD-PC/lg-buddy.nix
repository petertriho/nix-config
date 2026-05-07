{
  config,
  lib,
  pkgs,
  ...
}:
let
  configFile = "${config.homePath}/.config/lg-buddy/config.env";
  keyFile = "${config.homePath}/.config/lg-buddy/.aiopylgtv.sqlite";
  lgBuddyEnv = {
    LG_BUDDY_BSCPYLGTV_KEY_FILE = keyFile;
    LG_BUDDY_BSCPYLGTV_OWNER_USER = config.user;
    LG_BUDDY_CONFIG = configFile;
  };
in
{
  environment.systemPackages = [ pkgs.lg-buddy ];

  systemd.tmpfiles.rules = [
    "d /run/lg_buddy 0755 root root -"
    "d ${config.homePath}/.config/lg-buddy 0700 ${config.user} users -"
  ];

  systemd.services.LG_Buddy = {
    description = "Controls LG WebOS TV at startup and shutdown";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    environment = lgBuddyEnv;
    unitConfig = {
      ConditionPathExists = configFile;
      StartLimitIntervalSec = 30;
      StartLimitBurst = 5;
    };
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = "${pkgs.lg-buddy}/bin/lg-buddy startup boot";
      ExecStop = "${pkgs.lg-buddy}/bin/lg-buddy shutdown";
    };
  };

  systemd.services.LG_Buddy_lifecycle = {
    description = "LG Buddy system sleep/wake lifecycle monitor";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    environment = lgBuddyEnv;
    unitConfig.ConditionPathExists = configFile;
    serviceConfig = {
      Type = "simple";
      ExecStart = "${pkgs.lg-buddy}/bin/lg-buddy lifecycle";
      Restart = "on-failure";
      RestartSec = 10;
    };
  };

  networking.networkmanager.dispatcherScripts = [
    {
      type = "pre-down";
      source = pkgs.writeShellScript "LG_Buddy_lifecycle" ''
        set -eu

        if [ "''${2:-}" != "pre-down" ]; then
          exit 0
        fi

        if [ ! -r ${lib.escapeShellArg configFile} ]; then
          exit 0
        fi

        export LG_BUDDY_BSCPYLGTV_KEY_FILE=${lib.escapeShellArg keyFile}
        export LG_BUDDY_BSCPYLGTV_OWNER_USER=${lib.escapeShellArg config.user}
        export LG_BUDDY_CONFIG=${lib.escapeShellArg configFile}

        exec ${pkgs.lg-buddy}/bin/lg-buddy nm-pre-down
      '';
    }
  ];
}
