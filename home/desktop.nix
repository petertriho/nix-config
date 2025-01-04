{ pkgs, ... }:
{
  imports = [
    ./base.nix
    ./pkgs/alacritty.nix
    ./pkgs/hyprland.nix
    ./pkgs/waybar.nix
    # ./pkgs/wezterm.nix
  ];

  home.packages = with pkgs; [
    floorp-bin
  ];
}
