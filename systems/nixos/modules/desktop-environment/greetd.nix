{
  pkgs,
  lib,
  ...
}:
{
  services.greetd = {
    enable = true;
    settings = {
      default_session = {
        command = lib.strings.concatStringsSep " " [
          "${pkgs.tuigreet}/bin/tuigreet"
          "--no-xsession-wrapper"
          "--time"
          "--remember"
          "--remember-session"
          "--asterisks"
          # "--cmd"
          # "\"uwsm start hyprland-uwsm.desktop\""
        ];
        user = "greeter";
      };
    };
  };

  environment.systemPackages = with pkgs; [
    tuigreet
  ];
}
