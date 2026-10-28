{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-10-27";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "6033bab2a8051b5454552d2e8e6cb8f27c483a42";
    hash = "sha256-YqqAna8P+tPORmr9lqGY7EiU5PhGw3KT3iA0B9HsA7k=";
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
