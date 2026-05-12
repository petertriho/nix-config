{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-12";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "f304057d61d3df3c9fd992ac2b6e3833cb9325fb";
    sha256 = "sha256-jdUTec3217Bc+h5npjKOlIBHp3rhEd/sRKzDV2N7XIc=";
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
