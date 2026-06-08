{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-06-07";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "c30d329f5814647c1e2f071020c1e8c1c9893ef1";
    sha256 = "sha256-szcnow0yO1ViQt6Mxrd+PNdfZ5jzPqqSmqA0jEQnS1o=";
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
