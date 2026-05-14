{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-13";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "e74f0061bb67222181640effa98c675bdb2fdaa7";
    sha256 = "sha256-5Rr5BQe8bdQXWt/H6QjYpoM4X+GuWPK26rU2VSqTZVI=";
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
