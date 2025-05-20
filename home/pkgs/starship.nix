{
  pkgs,
  config,
  ...
}:
{
  home = {
    packages = with pkgs; [ starship ];
    sessionVariables = {
      STARSHIP_CONFIG = "${config.home.homeDirectory}/.config/starship.toml";
    };
  };

  xdg.configFile."starship.toml".source = config.lib.meta.mkDotfilesSymlink "starship/starship.toml";
}
