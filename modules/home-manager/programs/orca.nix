{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.orca;
in
{
  options.programs.orca = {
    enable = lib.mkEnableOption "Orca, the agent development environment";

    package = lib.mkPackageOption pkgs [ "llm-agents" "orca" ] { };

    finalPackage = lib.mkOption {
      type = lib.types.package;
      readOnly = true;
      internal = true;
      description = "The Orca package with the upstream Linux command names.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = pkgs.stdenv.hostPlatform.isLinux;
        message = "programs.orca supports only Linux. On macOS, install the `stablyai/orca/orca` Homebrew cask.";
      }
    ];

    # Upstream's deb makes `orca-ide` the CLI, and Orca's skill stubs run
    # `orca-ide` outside Orca terminals on Linux, because bare `orca` is
    # usually the GNOME screen reader. llm-agents makes `orca-ide` start the
    # GUI, so the GUI moves to `orca-ide-gui`. The CLI shim finds Electron
    # relative to its real path, so a link from `bin/` works.
    programs.orca.finalPackage = pkgs.symlinkJoin {
      name = "${cfg.package.name}-cli-names";
      paths = [ cfg.package ];
      postBuild = ''
        ln -s ${cfg.package}/bin/orca-ide $out/bin/orca-ide-gui
        ln -sfn ${cfg.package}/lib/Orca/resources/bin/orca-ide $out/bin/orca-ide

        rm $out/share/applications/orca-ide.desktop
        substitute ${cfg.package}/share/applications/orca-ide.desktop \
          $out/share/applications/orca-ide.desktop \
          --replace-fail "Exec=orca-ide " "Exec=orca-ide-gui "

        # Fail loudly if the llm-agents layout changes.
        for cmd in orca orca-ide orca-ide-gui; do
          test -x "$out/bin/$cmd"
        done
        grep -qx 'Exec=orca-ide-gui %U' $out/share/applications/orca-ide.desktop
      '';
      inherit (cfg.package) meta;
    };

    home.packages = [ cfg.finalPackage ];
  };
}
