{
  config,
  pkgs,
  ...
}:
{
  home.packages = with pkgs; [
    gh
    gh-dash
  ];

  xdg.configFile."gh/config.yml".source =
    config.lib.meta.mkDotfilesSymlink "gh/.config/gh/config.yml";
}
