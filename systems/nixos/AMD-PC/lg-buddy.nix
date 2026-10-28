{
  config,
  lib,
  pkgs,
  ...
}:
let
  configFile = "${config.homePath}/.config/lg-buddy/config.env";
  # Native token store derives its owner from the config file itself
  # (resolve_config_owner in the pinned upstream sources), so only the
  # config path needs exporting.
  lgBuddyEnv = {
    LG_BUDDY_CONFIG = configFile;
  };

  # Compares the MAC stored in config.env against the live neighbour cache
  # entry for the TV's IP. When they disagree (the TV has roamed between
  # Wi-Fi radios on a multi-band LG OLED), log the drift and leave repair to
  # the operator using the native `lg-buddy settings set tv.mac` command.
  # Never run interactive setup or apply a drift repair unattended.
  #
  # Also appends every distinct observed MAC to known_macs so the startup
  # wrapper can send Wake-on-LAN packets to historical MACs as well.
  macSyncScript = pkgs.writeShellScript "lg-buddy-mac-sync" ''
    set -euo pipefail
    export PATH="${lib.makeBinPath [
        pkgs.coreutils
        pkgs.gnused
        pkgs.gawk
        pkgs.gnugrep
        pkgs.iputils
        pkgs.iproute2
    ]}"

    config_file="${configFile}"
    [ -r "$config_file" ] || exit 0

    read_cfg() {
      local key="$1"
      sed -n "s/^''${key}=//p" "$config_file" | tail -n1
    }

    tv_ip="$(read_cfg tvs_primary_ip)"
    tv_ip="''${tv_ip:-$(read_cfg tv_ip)}"
    configured_mac="$(read_cfg tvs_primary_mac)"
    configured_mac="''${configured_mac:-$(read_cfg tv_mac)}"

    [[ "$tv_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 0
    [[ "$configured_mac" =~ ^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$ ]] || exit 0

    # Light ICMP nudge to refresh the neighbour entry if it has gone STALE.
    # ICMP does not wake a TV in deep standby; only Wake-on-LAN does.
    ${lib.getBin pkgs.iputils}/bin/ping -c 1 -W 1 "$tv_ip" >/dev/null 2>&1 || true

    current_mac="$(${lib.getBin pkgs.iproute2}/bin/ip neigh show "$tv_ip" 2>/dev/null \
      | awk '/lladdr/ { print $5; exit }')"
    [[ "$current_mac" =~ ^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$ ]] || exit 0

    current_mac="$(printf '%s' "$current_mac" | tr 'A-F' 'a-f')"
    configured_mac="$(printf '%s' "$configured_mac" | tr 'A-F' 'a-f')"

    # Record the observed MAC in the history file, one line per MAC. A
    # repeated MAC moves to the end, so the file is ordered by last sighting.
    known_macs_file="$(dirname "$config_file")/known_macs"
    touch "$known_macs_file"
    chmod 600 "$known_macs_file" 2>/dev/null || true
    tmp_known="$(mktemp)"
    grep -Fxv -- "$current_mac" "$known_macs_file" > "$tmp_known" 2>/dev/null || true
    printf '%s\n' "$current_mac" >> "$tmp_known"
    cat "$tmp_known" > "$known_macs_file"
    rm -f "$tmp_known"

    if [[ "$current_mac" == "$configured_mac" ]]; then
      exit 0
    fi

    printf 'lg-buddy-mac-sync: TV MAC drift detected (configured=%s current=%s); manually update the Wake-on-LAN target: ' \
      "$configured_mac" "$current_mac"
    printf 'sudo -u %q -- %q %q %q settings set tv.mac %q\n' \
      ${lib.escapeShellArg config.user} "${pkgs.coreutils}/bin/env" \
      "LG_BUDDY_CONFIG=$config_file" "${pkgs.lg-buddy}/bin/lg-buddy" "$current_mac"
    exit 0
  '';

  # Wraps `lg-buddy startup auto`, which sends Wake-on-LAN only to the
  # configured MAC. Before it runs, send Wake-on-LAN to the other MACs that
  # mac-sync recorded for this TV, so the TV still wakes after it roams to
  # another radio. A NIC ignores magic packets for other MACs, so the extra
  # packets are harmless. config.env is never changed here.
  startupWrapper = pkgs.writeShellScript "lg-buddy-startup-wrapper" ''
    set -euo pipefail
    export PATH="${lib.makeBinPath [
        pkgs.coreutils
        pkgs.gnused
        pkgs.gnugrep
    ]}"

    config_file="${configFile}"
    lg_buddy="${pkgs.lg-buddy}/bin/lg-buddy"
    [ -r "$config_file" ] || exec "$lg_buddy" startup auto
    known_macs_file="$(dirname "$config_file")/known_macs"

    read_cfg() {
      local key="$1"
      sed -n "s/^''${key}=//p" "$config_file" | tail -n1
    }

    configured_mac="$(read_cfg tvs_primary_mac)"
    configured_mac="''${configured_mac:-$(read_cfg tv_mac)}"
    configured_mac="$(printf '%s' "$configured_mac" | tr 'A-F' 'a-f')"

    other_macs=()
    if [[ -r "$known_macs_file" ]]; then
      while IFS= read -r mac; do
        [[ "$mac" =~ ^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$ ]] || continue
        mac="$(printf '%s' "$mac" | tr 'A-F' 'a-f')"
        if [[ "$mac" != "$configured_mac" ]]; then
          other_macs+=("$mac")
        fi
      done < "$known_macs_file"
    fi

    if (( ''${#other_macs[@]} > 0 )); then
      # Broadcasts sent before the network is up are lost. lg-buddy uses the
      # same nm-online wait before its own packet.
      ${pkgs.networkmanager}/bin/nm-online -q -t 60 || true
      printf 'lg-buddy-startup-wrapper: sending Wake-on-LAN to other known MAC(s): %s\n' \
        "''${other_macs[*]}" >&2
      # UDP broadcast has no delivery check, so send each packet three times.
      # A send failure must not stop the normal startup below.
      for _ in 1 2 3; do
        ${pkgs.wakeonlan}/bin/wakeonlan -q "''${other_macs[@]}" >&2 || true
        sleep 1
      done
    fi

    run_diagnostic() {
      # Keep unattended diagnostics to neighbour/ICMP checks. Native TV queries
      # can invoke PairIfNeeded and trigger interactive pairing.
      local tv_ip neigh
      tv_ip="$(read_cfg tvs_primary_ip)"
      tv_ip="''${tv_ip:-$(read_cfg tv_ip)}"
      printf 'lg-buddy-startup-wrapper: --- diagnostic after startup failure ---\n' >&2
      if [[ -z "$tv_ip" ]]; then
        printf 'lg-buddy-startup-wrapper: no TV IP in config; skipping diagnostic\n' >&2
        return 0
      fi
      neigh="$(${lib.getBin pkgs.iproute2}/bin/ip neigh show "$tv_ip" 2>/dev/null || true)"
      printf 'lg-buddy-startup-wrapper: neighbour for %s: %s\n' "$tv_ip" "$neigh" >&2
      if ${lib.getBin pkgs.iputils}/bin/ping -c 1 -W 1 "$tv_ip" >/dev/null 2>&1; then
        printf 'lg-buddy-startup-wrapper: %s responds to ICMP (TV network stack is up)\n' "$tv_ip" >&2
      else
        printf 'lg-buddy-startup-wrapper: %s does NOT respond to ICMP (TV offline or in deep standby)\n' "$tv_ip" >&2
      fi
    }

    # lg-buddy startup returns 0 even when it gives up on set_input retries,
    # so detect success from the output. tee forwards each line as it is
    # written, so journald timestamps show the real retry timing.
    log="$(mktemp)"
    trap 'rm -f "$log"' EXIT
    "$lg_buddy" startup auto 2>&1 | tee "$log" || true
    if grep -Fq "TV turned on and set to" "$log"; then
      exit 0
    fi

    run_diagnostic
    exit 1
  '';
in
{
  environment.systemPackages = [ pkgs.lg-buddy ];

  systemd.tmpfiles.rules = [
    # lg-buddy keeps its system sleep state and lock here. Every lg-buddy
    # process runs as config.user, so that user must own the directory.
    "d /run/lg_buddy 0755 ${config.user} users -"
    "d ${config.homePath}/.config/lg-buddy 0700 ${config.user} users -"
  ];

  systemd.services."lg-buddy" = {
    description = "Controls LG WebOS TV at startup and shutdown";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    restartIfChanged = false;
    environment = lgBuddyEnv // {
      # lg-buddy hardcodes 6 wake attempts and applies this value as a flat
      # sleep before each one. After a long standby the screen lights fast but
      # the WebOS SSAPI layer can take a few minutes to accept commands; at 20s
      # every attempt landed before that window opened (the 19:28 boot exhausted
      # all 6 by ~144s). 45s spreads the attempts across ~270s so one lands once
      # WebOS is ready. Safe because Type=oneshot has TimeoutStartSec=infinity.
      LG_BUDDY_STARTUP_RETRY_DELAY_SECS = "45";
    };
    unitConfig = {
      ConditionPathExists = configFile;
      StartLimitIntervalSec = 30;
      StartLimitBurst = 5;
    };
    serviceConfig = {
      Type = "oneshot";
      User = config.user;
      RemainAfterExit = true;
      # The wrapper exits 1 when the TV does not wake. Count that as success
      # so the unit stays active and ExecStop still turns the TV off at
      # shutdown. A failed unit is not stopped, so ExecStop would not run.
      SuccessExitStatus = [ 1 ];
      # Record the observed TV radio MAC for later Wake-on-LAN packets and log
      # drift without changing config. Falls through silently if the TV is
      # unreachable at boot.
      ExecStartPre = macSyncScript;
      ExecStart = startupWrapper;
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
      User = config.user;
      ExecStart = "${pkgs.lg-buddy}/bin/lg-buddy lifecycle";
      Restart = "on-failure";
      RestartSec = 10;
    };
  };

  systemd.services."lg-buddy-mac-sync" = {
    description = "LG Buddy TV MAC drift check";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    environment = lgBuddyEnv;
    unitConfig.ConditionPathExists = configFile;
    # Run as the user so the known_macs history file stays user-owned.
    serviceConfig = {
      Type = "oneshot";
      ExecStart = macSyncScript;
      User = config.user;
    };
  };

  systemd.timers."lg-buddy-mac-sync" = {
    description = "LG Buddy TV MAC drift periodic check";
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnBootSec = "2min";
      OnUnitActiveSec = "5min";
      AccuracySec = "30s";
      Persistent = false;
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

        export LG_BUDDY_CONFIG=${lib.escapeShellArg configFile}

        # NetworkManager runs this hook as root. Drop to the service user so
        # that lg-buddy-lifecycle can still write the files that this hook
        # creates in /run/lg_buddy.
        exec ${pkgs.util-linux}/bin/setpriv \
          --reuid=${lib.escapeShellArg config.user} --regid=users --init-groups \
          ${pkgs.lg-buddy}/bin/lg-buddy nm-pre-down
      '';
    }
  ];
}
