{
  config,
  lib,
  pkgs,
  ...
}:
{
  # The Quickshell which-key overlay must know which modifiers are held, and Wayland
  # gives clients no global key state. This reader can read every keystroke, so it
  # runs as a dynamic user with only the input group and no network. It sends only
  # modifier states and counters, and only the desktop user can connect.
  systemd.sockets.keymods = {
    description = "Held modifiers for the Quickshell which-key overlay";
    wantedBy = [ "sockets.target" ];
    listenStreams = [ "/run/keymods.sock" ];
    socketConfig = {
      SocketUser = config.user;
      SocketMode = "0600";
    };
  };

  systemd.services.keymods = {
    description = "Held modifiers for the Quickshell which-key overlay";
    requires = [ "keymods.socket" ];
    after = [ "keymods.socket" ];
    serviceConfig = {
      ExecStart = lib.getExe pkgs.keymods;
      Restart = "on-failure";
      RestartSec = 2;

      DynamicUser = true;
      SupplementaryGroups = [ "input" ];
      # Read-only access to /dev/input. PrivateDevices would hide /dev/input.
      DevicePolicy = "closed";
      DeviceAllow = [ "char-input r" ];

      CapabilityBoundingSet = "";
      AmbientCapabilities = "";
      NoNewPrivileges = true;
      PrivateNetwork = true;
      IPAddressDeny = "any";
      RestrictAddressFamilies = [ "AF_UNIX" ];
      ProtectSystem = "strict";
      ProtectHome = true;
      ProtectProc = "invisible";
      ProcSubset = "pid";
      ProtectKernelTunables = true;
      ProtectKernelModules = true;
      ProtectKernelLogs = true;
      ProtectControlGroups = true;
      ProtectClock = true;
      ProtectHostname = true;
      LockPersonality = true;
      MemoryDenyWriteExecute = true;
      RestrictNamespaces = true;
      RestrictRealtime = true;
      RestrictSUIDSGID = true;
      RemoveIPC = true;
      PrivateTmp = true;
      # A private user namespace would not map the input group, so the devices
      # would not open.
      PrivateUsers = false;
      SystemCallArchitectures = "native";
      SystemCallFilter = [
        "@system-service"
        "~@privileged"
        "~@resources"
      ];
      SystemCallErrorNumber = "EPERM";
      UMask = "0077";
    };
  };
}
