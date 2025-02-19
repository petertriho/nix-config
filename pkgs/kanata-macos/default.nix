{
  stdenv,
  fetchurl,
  ...
}:
let
  asset = if stdenv.isAarch64 then "kanata_macos_arm64" else "kanata_macos_x86_64";
  hash =
    if stdenv.isAarch64 then
      "sha256-oHIpb1Hvi3gJUYnYJWXGs1QPoHerdWCA1+bHjG4QAQ4="
    else
      "sha256-5p7KR0TWmCnDjKR0r2zT7q6Au8S6iNr5xgtitqBBwZ8=";
in
stdenv.mkDerivation rec {
  pname = "kanata-macos";
  version = "v1.8.0";

  src = fetchurl {
    url = "https://github.com/jtroo/kanata/releases/download/${version}/${asset}";
    inherit hash;
  };

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    mkdir -p $out/bin
    cp $src $out/bin/kanata
    chmod +x $out/bin/kanata
  '';
}
