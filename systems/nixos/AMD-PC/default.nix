{ inputs, ... }: {
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./lg-buddy.nix
    ../../../modules/system/openlinkhub.nix
  ];
  services.input-remapper.enable = true;
  services.openlinkhub.enable = true;

  system.stateVersion = "25.11";
}
