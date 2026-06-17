{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "6.0.2-unstable-2026-06-17";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "b62616fc12f6a007c6fd5118146821d748da0d33";
    sha256 = "sha256-D47uMC80wcIMNzW/rA7VUVGc4hzlmcZJMCrLyp2lbAY=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/superpowers
    cp -r . $out/share/superpowers/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Agentic skills framework and software development methodology";
    homepage = "https://github.com/obra/superpowers";
    license = licenses.mit;
    maintainers = [ ];
  };
}
