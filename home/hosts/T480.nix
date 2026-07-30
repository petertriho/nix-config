{ pkgs, ... }:
{
  imports = [
    ../profiles/desktop.nix
    ../programs/intel-gpu.nix
  ];
  home.packages = with pkgs; [
    cura-appimage
  ];
  # programs.niri.settings.outputs."eDP-1".scale = 1;
}
