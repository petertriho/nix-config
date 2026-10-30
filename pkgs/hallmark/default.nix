{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "hallmark";
  version = "0-unstable-2026-10-29";

  src = fetchFromGitHub {
    owner = "Nutlope";
    repo = "hallmark";
    rev = "4f6a46c6dc325d40ab268c93e25c7b96676ebccd";
    hash = "sha256-1pxBDUAPc9oVDdkv+i0hNGeBz5CpzuH1gtljPpkFMJU=";
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
