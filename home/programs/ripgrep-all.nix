{ pkgs, ... }:
{
  home.packages = with pkgs; [
    pandoc
    poppler
    ripgrep-all
    zlib
  ];
}
