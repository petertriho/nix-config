{pkgs, ...}: let
  howdoi = pkgs.python3Packages.howdoi.overridePythonAttrs (old: {
    doCheck = false;
  });
in {
  home.packages = with pkgs; [
    cht-sh
    coreutils-full
    dive
    fx
    glow
    howdoi
    iperf3
    openssl
    navi
    nurl
    tabiew
    tldr
    unzip
    update-nix-fetchgit
    watchexec
    zip
  ];
}
