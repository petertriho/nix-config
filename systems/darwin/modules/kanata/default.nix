{ pkgs, ... }:
let
  KDK_VER = "5.0.0";
  KDK_PKG = pkgs.fetchurl {
    url = "https://github.com/pqrs-org/Karabiner-DriverKit-VirtualHIDDevice/releases/download/v${KDK_VER}/Karabiner-DriverKit-VirtualHIDDevice-${KDK_VER}.pkg";
    sha256 = "sha256-hKi2gmIdtjl/ZaS7RPpkpSjb+7eT0259sbUUbrn5mMc=";
  };
  KDK_MANAGER = "/Applications/.Karabiner-VirtualHIDDevice-Manager.app/Contents/MacOS/Karabiner-VirtualHIDDevice-Manager";
  KDK_DAEMON = "/Library/Application Support/org.pqrs/Karabiner-DriverKit-VirtualHIDDevice/Applications/Karabiner-VirtualHIDDevice-Daemon.app/Contents/MacOS/Karabiner-VirtualHIDDevice-Daemon";
in
{
  system.activationScripts.postActivation.text =
    #sh
    ''
      if [ ! -f ${KDK_MANAGER} ]; then
        sudo /usr/sbin/installer -pkg ${KDK_PKG} -target /
      fi

      if [ -f ${KDK_MANAGER} ]; then
        ${KDK_MANAGER} activate
      else
        "Karabiner DriverKit installation failed"
      fi
    '';

  launchd.daemons = {
    karabinerDriverKit = {
      command = "sudo '${KDK_DAEMON}'";
      serviceConfig = {
        Label = "org.pqrs.karabiner.driverkit";
        RunAtLoad = true;
        KeepAlive = true;
        StandardOutPath = "/Library/Logs/Karabiner-DriverKit-VirtualHIDDevice/out.log";
        StandardErrorPath = "/Library/Logs/Karabiner-DriverKit-VirtualHIDDevice/error.log";
      };
    };
    kanata = {
      command = "sudo ${pkgs.kanata-macos}/bin/kanata -c /etc/kanata.kbd";
      serviceConfig = {
        Label = "local.jtroo.kanata";
        RunAtLoad = true;
        KeepAlive = true;
        StandardOutPath = "/Library/Logs/Kanata/out.log";
        StandardErrorPath = "/Library/Logs/Kanata/error.log";
      };
    };
  };

  environment = {
    systemPackages = with pkgs; [
      kanata-macos
    ];
    etc = {
      "kanata.kbd".source = ./kanata.kbd;
      "sudoers.d/karabiner-driverkit".source =
        pkgs.runCommand "sudoers-karabiner-driverkit" { }
          # sh
          ''
            BIN="${KDK_DAEMON}"
            SHASUM=$(sha256sum "$BIN" | cut -d' ' -f1)
            cat << EOF > "$out"
            %admin ALL=(root) NOPASSWD: sha256:$SHASUM $BIN
            EOF
          '';
      "sudoers.d/kanata".source =
        pkgs.runCommand "sudoers-kanata" { }
          # sh
          ''
            BIN="${pkgs.kanata-macos}/bin/kanata"
            SHASUM=$(sha256sum "$BIN" | cut -d' ' -f1)
            cat << EOF > "$out"
            %admin ALL=(root) NOPASSWD: sha256:$SHASUM $BIN
            EOF
          '';
    };
  };
}
