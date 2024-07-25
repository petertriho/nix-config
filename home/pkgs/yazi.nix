{
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    yazi
    # dependencies
    ffmpegthumbnailer
    file
    poppler
    unar
  ];
}
