{
  pkgs,
  lib,
  config,
  ...
}: {
  home.packages = with pkgs; [
    starship
  ];

  xdg.configFile."starship/starship.toml".source = config.lib.meta.mkDotfilesSymlink "starship/.config/starship.toml";
}
