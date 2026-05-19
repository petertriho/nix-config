{
  config,
  lib,
  pkgs,
  ...
}:
let
  inputRemapperAutoload = pkgs.writeShellScript "input-remapper-autoload" ''
    sleep 3
    ${pkgs.input-remapper}/bin/input-remapper-control --command autoload
  '';
in
{
  imports = [
    ./desktop.nix
  ];
  home = {
    packages = with pkgs; [
      amdgpu_top
      lg-buddy
    ];
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };
  xdg.configFile."input-remapper-2/config.json".source =
    config.lib.meta.mkDotfilesSymlink "input-remapper-2/config.json";
  xdg.configFile."input-remapper-2/presets/ELECOM TrackBall Mouse DEFT Pro TrackBall/new preset.json".source =
    config.lib.meta.mkDotfilesSymlink "input-remapper-2/presets/ELECOM TrackBall Mouse DEFT Pro TrackBall/new preset.json";
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
    input.trackball = {
      accel-profile = "adaptive";
      scroll-method = "on-button-down";
      scroll-button = 274;
    };
    spawn-at-startup = [
      { command = [ "discord" ]; }
      { command = [ "${inputRemapperAutoload}" ]; }
    ];
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
