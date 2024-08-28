{ config, ... }:
{
  xdg.configFile."wezterm".source = config.lib.meta.mkDotfilesSymlink "wezterm/.config/wezterm";
}
