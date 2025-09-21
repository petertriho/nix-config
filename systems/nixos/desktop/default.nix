{ ... }:
{
  imports = [
    ../base.nix
    ../modules/desktop-environment
    ../modules/kanata.nix
    ./audio.nix
    ./bootloader.nix
    ./networking.nix
  ];
  services.fwupd.enable = true;
  services.printing.enable = true;

  programs.firefox.enable = true;
}
