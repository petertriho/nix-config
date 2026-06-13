{ inputs, ... }:
{
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./lg-buddy.nix
  ];
  services.input-remapper.enable = true;

  system.stateVersion = "25.11";
}
