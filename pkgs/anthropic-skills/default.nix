{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-08-21";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "3b3fad96af16a10759d930941b4520ba0c40edae";
    sha256 = "sha256-nVid8vENmLDh7ffDqh+bJbEWtXcVltA0qa2rItmniZM=";
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
