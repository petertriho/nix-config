{
  stdenv,
  fetchurl,
  ...
}:
let
  asset = if stdenv.isAarch64 then "kanata_macos_arm64" else "kanata_macos_x86_64";
  sha256 =
    if stdenv.isAarch64 then
      "1fmv60g4r3ij1m6xa1bxsd93whjc1l69bd96qrx7dy96n27bii60"
    else
      "1rhvv4ps7vs9yq8xwybn0ivw7wmvm09j5nrx0d5yj2i6r3cgs9zq";
in
stdenv.mkDerivation rec {
  pname = "kanata-macos";
  version = "v1.8.0-prerelease-1";

  src = fetchurl {
    url = "https://github.com/jtroo/kanata/releases/download/${version}/${asset}";
    inherit sha256;
  };

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    mkdir -p $out/bin
    cp $src $out/bin/kanata
    chmod +x $out/bin/kanata
  '';
}
