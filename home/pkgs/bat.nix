{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    bat
  ];

  xdg.configFile."bat".source = config.lib.meta.mkDotfilesSymlink "bat/.config/bat";
}
