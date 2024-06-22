{pkgs, ...}: {
  home.packages = with pkgs; [
    vivid
  ];

  xdg.configFile."vivid/themes".source = ./config/themes;
}
