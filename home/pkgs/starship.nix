{
  pkgs,
  config,
  ...
}:
{
  home.packages = with pkgs; [ starship ];

  xdg.configFile."starship.toml".source = config.lib.meta.mkDotfilesSymlink "starship/starship.toml";
}
