{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-10-28";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "8f6969f8922caabde9de1784959eae11ddf68073";
    hash = "sha256-xD+vXYxKZUk0Ry98LXu3/ryy5k8ZNPrTGuP04IzLQf0=";
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
