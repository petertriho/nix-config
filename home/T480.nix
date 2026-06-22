{ pkgs, ... }:
{
  imports = [
    ./desktop.nix
    ./pkgs/intel-gpu.nix
  ];
  home.packages = with pkgs; [
    cura-appimage
  ];
  # programs.niri.settings.outputs."eDP-1".scale = 1;
}
