{
  lib,
  pkgs,
  ...
}:
{
  imports = [
    ./desktop.nix
  ];
  home = {
    packages = [ pkgs.lg-buddy ];
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };
  services.hypridle.settings.listener = lib.mkForce [
    {
      timeout = 3600;
      on-timeout = "loginctl lock-session";
    }
    {
      timeout = 3900;
      on-timeout = "${pkgs.lg-buddy}/bin/lg-buddy screen-off; ${pkgs.niri}/bin/niri msg action power-off-monitors";
      on-resume = "${pkgs.niri}/bin/niri msg action power-on-monitors; ${pkgs.lg-buddy}/bin/lg-buddy screen-on";
    }
  ];
  programs.niri.settings = {
    spawn-at-startup = [ { command = [ "discord" ]; } ];
    outputs = {
      "HDMI-A-1" = {
        focus-at-startup = true;
        position = {
          x = 0;
          y = 0;
        };
        scale = 1.25;
      };
      "DP-2" = {
        position = {
          x = 3072;
          y = 0;
        };
        scale = 2;
        transform.rotation = 90;
      };
    };
  };
}
