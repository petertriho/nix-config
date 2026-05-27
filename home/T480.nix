{ pkgs, ... }:
{
  imports = [
    ./desktop.nix
    ./pkgs/intel-gpu.nix
  ];
  home.packages = with pkgs; [
    cura-appimage
  ];
}
