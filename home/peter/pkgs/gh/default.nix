{pkgs, ...}: {
  home.packages = with pkgs; [
    gh
  ];

  xdg.configFile."gh/config.yml".source = ./config.yml;
}
