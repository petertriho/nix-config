{ ... }:
{
  imports = [
    ./desktop.nix
  ];
  home = {
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };
  programs.niri.settings.outputs = {
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
}
