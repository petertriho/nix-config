{ pkgs, ... }:
{
  abbreviation-tips = pkgs.callPackage ./abbreviation-tips { };
  async-prompt-fork = pkgs.callPackage ./async-prompt-fork { };
  colored-man-pages-fork = pkgs.callPackage ./colored-man-pages-fork { };
  replay = pkgs.callPackage ./replay { };
  upto = pkgs.callPackage ./upto { };
}
