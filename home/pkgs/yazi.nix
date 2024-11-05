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
    enable = false;
    # TODO: revert when https://github.com/NixOS/nixpkgs/issues/353119 is available
    package = pkgs.yazi.override {
      _7zz = pkgs._7zz.override { useUasm = true; };
    };
  };
}
