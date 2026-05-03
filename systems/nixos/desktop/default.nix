{ inputs, ... }:
{
  imports = [
    ../base.nix
    ../modules/desktop-environment
    ../modules/kanata.nix
    ./audio.nix
    ./bootloader.nix
    ./networking.nix
    inputs.nix-flatpak.nixosModules.nix-flatpak
  ];

  services = {
    # flatpak = {
    #   enable = true;
    #   remotes = [
    #     {
    #       name = "flathub";
    #       location = "https://dl.flathub.org/repo/flathub.flatpakrepo";
    #     }
    #   ];
    #   packages = [ ];
    # };
    fwupd.enable = true;
    printing.enable = true;
  };

  programs.firefox.enable = true;
}
