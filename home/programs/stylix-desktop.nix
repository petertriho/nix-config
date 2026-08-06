{ ... }:
{
  stylix.targets = {
    alacritty = {
      enable = true;
      fonts.override.sizes.terminal = 10;
    };
    fuzzel = {
      enable = true;
      icons.enable = false;
    };
    gtk = {
      enable = true;
      flatpakSupport.enable = false;
    };
    hyprlock = {
      enable = false;
      image.enable = false;
    };
    qt = {
      enable = true;
      icons.enable = false;
    };
    vicinae = {
      enable = true;
      fonts.override.sizes.applications = 11;
    };
    zathura.enable = true;
  };
}
