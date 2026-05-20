{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-20";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "b8be62ffacb0118fa3eaa29a0923c87c8c11985c";
    sha256 = "sha256-Qwuu27f95xgAJ4hdv/4TNahHhprCMIxl1H9f9ymEsno=";
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
