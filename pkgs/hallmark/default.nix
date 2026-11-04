{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-11-03";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "52328cb3129135499e4e178d4864ee90029dea2b";
    hash = "sha256-jkjNqs4fe3aQDHlvNlwvtoyJEIWMoskN5qeuxAlEs8M=";
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
