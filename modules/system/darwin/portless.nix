{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.portless;
  stateDir = "${config.homePath}/.portless";

  # The proxy runs as root. portless uses SUDO_UID and SUDO_GID to give the
  # files that it creates in the state directory back to the user.
  #
  # portless does not give back every file: `proxy.tls` and `ca.srl` stay
  # owned by root, and launchd creates `service.log` as root. While the
  # service is down, `portless run` starts its own proxy as the user, which
  # then fails with EACCES on those files. The chown returns them at each
  # start. The proxy writes these files again in place, so they keep the
  # user as owner.
  launcher = pkgs.writeShellScript "portless-proxy" ''
    SUDO_UID=$(/usr/bin/id -u ${lib.escapeShellArg config.user})
    SUDO_GID=$(/usr/bin/id -g ${lib.escapeShellArg config.user})
    export SUDO_UID SUDO_GID
    /usr/sbin/chown -R "$SUDO_UID:$SUDO_GID" ${lib.escapeShellArg stateDir}
    exec ${lib.getExe cfg.package} proxy start --foreground --port 443 --https --skip-trust
  '';
in
{
  options.services.portless = {
    enable = lib.mkEnableOption "the portless HTTPS proxy on port 443";

    package = lib.mkPackageOption pkgs "portless" { };
  };

  config = lib.mkIf cfg.enable {
    # launchd opens the log file before the proxy starts, so the state
    # directory must exist. portless creates it as 0755, owned by the user.
    system.activationScripts.preActivation.text = ''
      if [ ! -d ${lib.escapeShellArg stateDir} ]; then
        /usr/bin/install -d -m 0755 \
          -o ${lib.escapeShellArg config.user} \
          -g "$(/usr/bin/id -g ${lib.escapeShellArg config.user})" \
          ${lib.escapeShellArg stateDir}
      fi
    '';

    # Mirrors the plist that `portless service install` writes, but with
    # store paths that each switch keeps current. The upstream label keeps a
    # single plist path, so a manual `service install` replaces this daemon
    # instead of adding a second proxy on port 443.
    #
    # `command`, not `serviceConfig.ProgramArguments`: nix-darwin runs it
    # behind `/bin/wait4path /nix/store`. At boot, launchd loads the daemon
    # before the encrypted Nix Store volume is mounted. A store path as the
    # program then fails with "Missing executable detected" (EX_CONFIG), and
    # launchd does not retry it until the daemon is loaded again.
    launchd.daemons.portless.command = "${launcher}";
    launchd.daemons.portless.serviceConfig = {
      Label = "sh.portless.proxy";
      EnvironmentVariables = {
        HOME = config.homePath;
        PORTLESS_STATE_DIR = stateDir;
        PORTLESS_PORT = "443";
        PORTLESS_HTTPS = "1";
        PORTLESS_LAN = "0";
        PORTLESS_WILDCARD = "0";
        PORTLESS_UNPRIVILEGED = "0";
      };
      RunAtLoad = true;
      KeepAlive = true;
      StandardOutPath = "${stateDir}/service.log";
      StandardErrorPath = "${stateDir}/service.log";
    };
  };
}
