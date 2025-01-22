{ pkgs, ... }:
{
  home.packages = with pkgs; [
    # dependencies
    ffmpegthumbnailer
    file
    poppler
    unar
  ];

  programs.yazi = {
    enable = true;
    enableFishIntegration = false;
  };
}
