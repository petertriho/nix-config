{ ... }:
{
  imports = [ ./base.nix ];

  networking.hostName = "MBP14-M1";

  homebrew.casks = [
    "microsoft-teams"
    "zoom"
  ];
}
