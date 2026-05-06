{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-06";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "b27a1a46f80419030e28404ffc8eefb995ea28a5";
    sha256 = "sha256-y7j1gScBl/dkmUTjw8xqaiHCwNTQdD43GIxumACiGwo=";
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
