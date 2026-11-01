{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-10-31";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "5ce160a3e76dc1c0f9301f8a1903704ec607636a";
    hash = "sha256-Yam2kp28QrUzoZy57AHU3G7jbFXRdaLHezOIq7POgWg=";
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
