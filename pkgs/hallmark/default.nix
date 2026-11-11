{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-11-10";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "7e213cb6feb4ef82733bd66a0600b2e54ca0994c";
    hash = "sha256-yFvdXkoLZEnoDYqv7cSA6ZK1SOrYXMp81SSwmMlK5Lg=";
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
