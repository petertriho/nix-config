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
    sha256 = "sha256-wMS4jrAm+XZ6xia1lQwNTEI+UtN9BdVNDTKOTB4wu7o=";
  };

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    mkdir -p $out/bin
    cp $src $out/bin/kanata
    chmod +x $out/bin/kanata
  '';
}
