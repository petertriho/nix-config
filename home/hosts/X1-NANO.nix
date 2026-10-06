{
  lib,
  pkgs,
  ...
}:
{
  imports = [
    ../profiles/desktop.nix
    ../programs/intel-gpu.nix
  ];
  programs = {
    claude-code = {
      enable = true;
      cliProxyApi.enable = true;
    };
    niri.settings.outputs."eDP-1".scale = 1.25;
  };

  # Shared hypridle lives in home/programs/wayland-common.nix. Repeat its
  # listeners here and add dim. No effect while active.
  services.hypridle.settings.listener = lib.mkForce [
    {
      timeout = 150;
      on-timeout = "brightnessctl -s && brightnessctl set 20%";
      on-resume = "brightnessctl -r";
    }
    {
      timeout = 300;
      on-timeout = "loginctl lock-session";
    }
    {
      timeout = 330;
      on-timeout = "${pkgs.niri-unstable}/bin/niri msg action power-off-monitors";
      on-resume = "${pkgs.niri-unstable}/bin/niri msg action power-on-monitors";
    }
  ];
}
