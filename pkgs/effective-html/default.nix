{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-10-15";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "975b047f6da6874e176db54f048c0c31c30e9f65";
    hash = "sha256-24KqX6FXRlzAJIlISwUbyg9igA78B8CMT6pkx47/kwE=";
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
