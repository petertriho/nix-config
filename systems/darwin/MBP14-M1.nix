{ ... }:
{
  imports = [ ./base.nix ];

  networking.hostName = "MBP14-M1";

  homebrew.casks = [
    "bartender"
    "betterdisplay"
    "jellyfin-media-player"
  ];

  system.stateVersion = 5;
}
