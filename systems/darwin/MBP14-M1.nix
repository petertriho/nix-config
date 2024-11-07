{ ... }:
{
  imports = [ ./base.nix ];

  networking.hostName = "MBP14-M1";

  homebrew.casks = [
    "microsoft-auto-update"
    "microsoft-teams"
    "zoom"
  ];
}
