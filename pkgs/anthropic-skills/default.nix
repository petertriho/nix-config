{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-09-24";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "33375500bcea98d610eb30ce10ac4e59b89c390d";
    sha256 = "sha256-xUs7UX8pOcZwR0okaSbI/f8EE5F4Zi/BUd+nIZNafPc=";
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
