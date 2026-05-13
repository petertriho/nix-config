{ pkgs, ... }:
{
  imports = [
    ./desktop.nix
    ./pkgs/intel-gpu.nix
  ];

  home.packages = with pkgs; [
    radeontop
  ];

  home.sessionVariables = {
    # Keep unset until /dev/dri/by-path is inspected on the MacBook. If Hyprland
    # or Niri chooses the Intel GPU first, set AQ_DRM_DEVICES to the Radeon path
    # before the Intel path here.
    # AQ_DRM_DEVICES = "/dev/dri/by-path/<radeon-card>:/dev/dri/by-path/<intel-card>";
  };
}
