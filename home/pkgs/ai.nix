{ pkgs, config, ... }:
{
  home.packages = with pkgs; [ opencode ];

  xdg.configFile."opencode/opencode.json".source =
    config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode.json";
}
