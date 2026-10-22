{ pkgs, ... }:
{
  home.packages = with pkgs; [
    pandoc
    ripgrep-all
    zlib
  ];
}
