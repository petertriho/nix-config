{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.iris;
  configSource = config.lib.meta.mkDotfilesSymlink "iris/.config/iris/config.toml";
  isDarwin = pkgs.stdenv.hostPlatform.isDarwin;
in
{
  options.programs.iris = {
    enable = lib.mkEnableOption "IRIS shell autocomplete and navigation";
    package = lib.mkPackageOption pkgs "iris" { };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    home.file = lib.mkIf isDarwin {
      "Library/Application Support/iris/config.toml".source = configSource;
    };

    xdg.configFile = lib.mkIf (!isDarwin) {
      "iris/config.toml".source = configSource;
    };

    programs.fish.interactiveShellInit = lib.mkAfter ''
      # tmux can inherit IRIS markers without the corresponding control FD.
      if set -q TMUX IRIS_PID
          if not set -q IRIS_FD; or not ${pkgs.coreutils}/bin/test -e /dev/fd/$IRIS_FD
              set --erase IRIS_PID IRIS_IS_CHILD IRIS_FD
          end
      end

      ${lib.getExe cfg.package} init fish | source
    '';
  };
}
