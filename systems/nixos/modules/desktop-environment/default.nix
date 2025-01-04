{ pkgs, ... }:
{
  imports = [
    ./hyprland.nix
    ./i18n.nix
    ./sddm.nix
  ];

  services.desktopManager.plasma6.enable = true;

  services.xserver.enable = true;
  services.xserver.xkb = {
    layout = "au";
    variant = "";
  };

  fonts.packages = with pkgs; [
    nerd-fonts.jetbrains-mono
  ];

  environment.systemPackages = with pkgs; [
    wl-clipboard-rs
  ];
}
