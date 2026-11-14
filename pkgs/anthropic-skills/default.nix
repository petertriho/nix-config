{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-11-14";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064";
    sha256 = "sha256-pEKTL8YlOAem5QfNzLkjJaEDTp7PhtG/uyzjPzOL7Jo=";
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
