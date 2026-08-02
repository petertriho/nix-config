{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-08-01";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "926bd52692501499362574223f19cf0f384bf5a5";
    hash = "sha256-voWTvtH189qLPJ9G4ZR2RtDPjreifk2pj87jFO/dNGU=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/effective-html
    cp -r skills $out/share/effective-html/

    runHook postInstall
  '';

  meta = with lib; {
    description = "HTML design skills for AI coding agents";
    homepage = "https://github.com/plannotator/effective-html";
    license = licenses.mit;
    maintainers = [ ];
  };
}
