{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-11-04";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "de4999e0cd7a7a41df0b4e6903fa02fe9f1492a8";
    hash = "sha256-2zfT84pg8+0eNajCHVL1CjsJ7z+S6r4cmq6+gdlc5wE=";
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
