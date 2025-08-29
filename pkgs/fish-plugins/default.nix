{ pkgs, ... }:
with pkgs;
{
  upto = callPackage ./upto { };
}
