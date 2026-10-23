{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-10-22";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "7ec868225c6caa040558c321ee0fefa0e73f83a8";
    hash = "sha256-/P90RLZJXMvc3RDx0AceT4RzMGm9hf+9HeNxV0/kwVw=";
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
