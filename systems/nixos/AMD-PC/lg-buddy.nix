{
  config,
  lib,
  pkgs,
  ...
}:
let
  configFile = "${config.homePath}/.config/lg-buddy/config.env";
  keyFile = "${config.homePath}/.config/lg-buddy/.aiopylgtv.sqlite";
  primeNeighbor = pkgs.writeShellScript "lg-buddy-prime-neighbor" ''
    set -eu

    if [ ! -r ${lib.escapeShellArg configFile} ]; then
      exit 0
    fi

    . ${lib.escapeShellArg configFile}
    tv_ip="''${tvs_primary_ip:-''${tv_ip:-}}"
    tv_mac="''${tvs_primary_mac:-''${tv_mac:-}}"

    if [ -z "$tv_ip" ] || [ -z "$tv_mac" ]; then
      exit 0
    fi

    dev="$(${pkgs.iproute2}/bin/ip route get "$tv_ip" | ${pkgs.gawk}/bin/awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')"
    if [ -z "$dev" ]; then
      exit 0
    fi

    # Wi-Fi LG TVs may need unicast WOL while asleep, before ARP can resolve.
    ${pkgs.iproute2}/bin/ip neigh replace "$tv_ip" lladdr "$tv_mac" nud permanent dev "$dev" || true
  '';
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

  systemd.services."lg-buddy" = {
    description = "Controls LG WebOS TV at startup and shutdown";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    restartIfChanged = false;
    environment = lgBuddyEnv // {
      LG_BUDDY_STARTUP_RETRY_DELAY_SECS = "20";
    };
    unitConfig = {
      ConditionPathExists = configFile;
      StartLimitIntervalSec = 30;
      StartLimitBurst = 5;
    };
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStartPre = primeNeighbor;
      ExecStart = "${pkgs.lg-buddy}/bin/lg-buddy startup boot";
      ExecStop = "${pkgs.lg-buddy}/bin/lg-buddy shutdown";
    };
  };

  systemd.services."lg-buddy-lifecycle" = {
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
      source = pkgs.writeShellScript "lg-buddy-lifecycle" ''
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
