{ pkgs, ... }:
with pkgs;
{
  bitwarden = callPackage ./bitwarden { };
}
