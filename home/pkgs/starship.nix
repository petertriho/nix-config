{
  pkgs,
  config,
  ...
}:
{
  home = {
    packages = with pkgs; [ starship ];
    sessionVariables = {
      STARSHIP_CONFIG = "${config.home.homeDirectory}/.config/starship/starship.toml";
    };
  };

  xdg.configFile."starship/starship.toml".source =
    config.lib.meta.mkDotfilesSymlink "starship/.config/starship/starship.toml";
}
