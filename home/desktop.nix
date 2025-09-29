{
  inputs,
  pkgs,
  ...
}:
{
  imports = [
    ./base.nix
    inputs.vicinae.homeManagerModules.default
    ./pkgs/alacritty.nix
    ./pkgs/ghostty.nix
    ./pkgs/hyprland.nix
    ./pkgs/quickshell.nix
    ./pkgs/waybar.nix
    ./pkgs/vicinae.nix
    # ./pkgs/wezterm.nix
  ];

  home.packages = with pkgs; [
    floorp-bin
    ungoogled-chromium
  ];
}
