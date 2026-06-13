{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "last30days-skill";
  version = "0-unstable-2026-06-06";

  src = fetchFromGitHub {
    owner = "mvanhorn";
    repo = "last30days-skill";
    rev = "122158415ae421da83e739f2668032f6bc78d39c";
    hash = "sha256-Z9IMwsQavs2cli8G9eFl5jd9OcAZaGbQpZy7gDrzGT4=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/last30days-skill
    cp -r . $out/share/last30days-skill/

    runHook postInstall
  '';

  meta = with lib; {
    description = "AI agent-led search skill for researching the last 30 days";
    homepage = "https://github.com/mvanhorn/last30days-skill";
    license = licenses.mit;
    maintainers = [ ];
  };
}
