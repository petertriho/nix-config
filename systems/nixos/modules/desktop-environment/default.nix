{ pkgs, ... }:
{
  imports = [
    ./greetd.nix
    ./hyprland.nix
    ./i18n.nix
    ./niri.nix
  ];
  services = {
    desktopManager = {
      plasma6.enable = true;
      cosmic.enable = false;
    };
    xserver = {
      enable = false;
      xkb = {
        layout = "au";
        variant = "";
      };
    };
  };

  fonts.packages = with pkgs; [
    nerd-fonts.jetbrains-mono
  ];

  environment.systemPackages = with pkgs; [
    wl-clipboard-rs
  ];
}
