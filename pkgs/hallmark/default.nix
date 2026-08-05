{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-08-04";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "0a0f706bc0289fef76a07fb854a6a5b031c57901";
    hash = "sha256-4LAOtsDU8Rkj8MSsSO9Kc1gVcGf+m1M2hm/khmuQnVA=";
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
