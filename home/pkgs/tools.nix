{pkgs, ...}: let
  howdoi = pkgs.python3Packages.howdoi.overridePythonAttrs (old: {
    doCheck = false;
  });
  tabiew = with pkgs;
    rustPlatform.buildRustPackage rec {
      pname = "tabiew";
      version = "0.4.1";
      src = fetchFromGitHub {
        owner = "shshemi";
        repo = pname;
        rev = "v${version}";
        hash = "sha256-/W6ffanDg+p0g5MFUEF9bjWmYPWjZeCGmHqbruju2hk=";
      };
      cargoHash = "sha256-dBk6lfUG7MFJCOdDt+LpkewnYS/awqCLPLUCFSyi5Y8=";
    };
in {
  home.packages = with pkgs; [
    cht-sh
    coreutils-full
    dive
    fx
    glow
    howdoi
    iperf3
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
