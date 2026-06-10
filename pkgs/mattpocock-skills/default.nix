{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-06-09";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "e3d8b735ef92ec9554b07f11f408089d81289eed";
    sha256 = "sha256-QWzXya00MVBzc+Yn6AHlY9xsoBEsxZj2577dpuQK+j0=";
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
