{ ... }: {
  imports = [ ./base.nix ];
  homebrew = {
    brews = [
      "sane-backends"
    ];
    casks = [
      "bartender"
      "betterdisplay"
      "jellyfin-media-player"
    ];
  };

  system.stateVersion = 5;
}
