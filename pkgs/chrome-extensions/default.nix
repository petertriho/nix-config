{ pkgs, ... }:
with pkgs;
{
  chromium-web-store = callPackage ./chromium-web-store { };
}
