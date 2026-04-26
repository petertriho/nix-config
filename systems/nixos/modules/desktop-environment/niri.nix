{
  pkgs,
  inputs,
  ...
}:
{
  nixpkgs.overlays = [ inputs.niri.overlays.niri ];

  programs.niri = {
    enable = true;
    package = pkgs.niri-unstable;
  };

  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-gtk ];
  };
}
