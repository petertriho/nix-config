{ pkgs, ... }:
with pkgs;
{
  abbreviation-tips = callPackage ./abbreviation-tips { };
  async-prompt-fork = callPackage ./async-prompt-fork { };
  colored-man-pages-fork = callPackage ./colored-man-pages-fork { };
  replay = callPackage ./replay { };
  upto = callPackage ./upto { };
}
