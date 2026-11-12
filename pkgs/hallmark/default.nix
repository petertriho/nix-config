{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-11-11";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "04977e15f3dfd6ee4b74c887dac3eb52665d6c92";
    hash = "sha256-xfHv/bcZcYoqEeX2hCZOADCEJ2m3tRDflKJmyiR5LNk=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/hallmark
    cp -r skills $out/share/hallmark/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Anti-AI-slop design skill for Claude Code, Cursor, and Codex";
    homepage = "https://github.com/Nutlope/hallmark";
    license = licenses.mit;
    maintainers = [ ];
  };
}
