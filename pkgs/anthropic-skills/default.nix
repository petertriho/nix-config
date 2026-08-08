{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-08-07";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "f17010c9bb483898c1d9c9f42dde2b3a98889434";
    sha256 = "sha256-vTqAu8eRY+8ymbf065SWHHjNX/li3SOR+sWq1npteTM=";
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
