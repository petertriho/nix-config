{
  stdenv,
  fetchurl,
  ...
}:
stdenv.mkDerivation {
  pname = "kanata-macos";
  version = "v1.8.0-prerelease-1";

  src = fetchurl {
    url = "https://github.com/jtroo/kanata/releases/download/v1.8.0-prerelease-1/kanata_macos_arm64";
    sha256 = "1fmv60g4r3ij1m6xa1bxsd93whjc1l69bd96qrx7dy96n27bii60";
  };

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    mkdir -p $out/bin
    cp $src $out/bin/kanata
    chmod +x $out/bin/kanata
  '';
}
