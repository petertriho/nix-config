{ pkgs, ... }:
with pkgs;
{
  colored-man-pages-fork = callPackage ./colored-man-pages-fork { };
  upto = callPackage ./upto { };
}
