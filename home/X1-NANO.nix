{ pkgs, ... }:
{
  imports = [
    ./desktop.nix
    ./pkgs/intel-gpu.nix
  ];
  home = {
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };

  programs.niri.settings.outputs."eDP-1".scale = 1.25;
}
