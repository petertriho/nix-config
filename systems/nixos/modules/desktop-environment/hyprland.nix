{
  inputs,
  pkgs,
  ...
}:
{
  programs.uwsm.enable = true;
  programs.hyprland = {
    enable = true;
    withUWSM = true;
    xwayland.enable = false;
    package = inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.hyprland;
    portalPackage =
      inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.xdg-desktop-portal-hyprland;
  };
  security.pam.services.hyprlock = { };

  environment.sessionVariables.NIXOS_OZONE_WSL = "1";
}
