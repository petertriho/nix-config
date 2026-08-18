{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-08-17";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "f379e5ad66e2febc1616cf8d6284666fecbe514e";
    sha256 = "sha256-BDLEsQ4rJLspINlHpu0rkvaC4BHdwQ4QUTko/v+xbAE=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/anthropic-skills
    cp -r . $out/share/anthropic-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Anthropic skills repository";
    homepage = "https://github.com/anthropics/skills";
    license = licenses.mit;
    maintainers = [ ];
  };
}
