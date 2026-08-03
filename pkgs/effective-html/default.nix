{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-08-03";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "cc1f962d65f497cd4209a83f702e0aaaabec4cee";
    hash = "sha256-m766NRZ4G1lyogp8WKV9h97g2QoX/LjeLc05zEArS08=";
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
