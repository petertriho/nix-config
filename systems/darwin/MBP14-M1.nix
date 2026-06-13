{ ... }:
{
  imports = [ ./base.nix ];
  homebrew.casks = [
    "bartender"
    "betterdisplay"
    "jellyfin-media-player"
  ];

  system.stateVersion = 5;
}
