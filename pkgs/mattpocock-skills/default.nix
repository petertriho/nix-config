{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-07";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "733d312884b3878a9a9cff693c5886943753a741";
    sha256 = "sha256-HyJLE9+ItZY0nB87eMfONSAc3L6dndcApoRpbO+D7UY=";
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
