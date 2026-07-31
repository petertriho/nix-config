{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.iris;
in
{
  options.programs.iris = {
    enable = lib.mkEnableOption "IRIS shell autocomplete and navigation";
    package = lib.mkPackageOption pkgs "iris" { };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    xdg.configFile."iris/config.toml".source =
      config.lib.meta.mkDotfilesSymlink "iris/.config/iris/config.toml";

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
