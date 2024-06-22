{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    vivid
  ];

  xdg.configFile."vivid/themes".source = config.lib.meta.mkSymlink ./config/themes;
}
