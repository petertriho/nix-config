{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-08-06";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "13ac0ec7e148655948100b6396439e481361d690";
    hash = "sha256-JflLR1ZgJZuqktK8rnYu7P0l0lKbB+MoQzs/SY/gcJs=";
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
