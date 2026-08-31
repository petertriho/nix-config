{ inputs, ... }: {
  imports = [
    ../desktop
    ./hardware-configuration.nix
    ./lg-buddy.nix
    ../../../modules/system/openlinkhub.nix
  ];

  # Work around Gecko repaint lag on the fractionally scaled LG output.
  # set-environment reaches login shells, and niri imports it into the
  # systemd user manager, so vicinae-launched apps see it too.
  environment.sessionVariables.MOZ_ENABLE_WAYLAND = "0";

  services.input-remapper.enable = true;
  services.openlinkhub.enable = true;

  system.stateVersion = "25.11";
}
