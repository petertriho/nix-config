{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-11";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "9f2e0bd0ea776eb6372eb81fa8a4a47814a8404a";
    sha256 = "sha256-qNEz3MKlsRGrAwsov+CU7MVFDkAggloTtoZrmmUjMDE=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/mattpocock-skills
    cp -r . $out/share/mattpocock-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Matt Pocock skills repository";
    homepage = "https://github.com/mattpocock/skills";
    maintainers = [ ];
  };
}
