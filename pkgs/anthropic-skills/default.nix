{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-11-06";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "2c5958ecac7cee2b583967a2c4981d0f4a75c579";
    sha256 = "sha256-dRCZrNarCCJFuvATgfW6qmwwVS5HGFXNVGOhbVZd7LA=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/anthropic-skills
    cp -r . $out/share/anthropic-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Anthropic skills repository";
    homepage = "https://github.com/anthropics/skills";
    license = licenses.mit;
    maintainers = [ ];
  };
}
