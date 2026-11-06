{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-11-05";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "407fa689f4a276f2fd389208d271d0fef08f5058";
    hash = "sha256-+X+JqbIPeyhZDEkj+v/ZSggxIUUajI4B4CJCidwqX0g=";
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
