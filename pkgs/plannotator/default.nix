{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.14.4-unstable-2026-03-21";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "4fd0ff45f28ac570d3a8f6bf7ae01fef782a301c";
    sha256 = "sha256-ORh8eRsFaRavK+HPkfbYdpxcr0w9919iZI9gmS+T+Z4=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/plannotator
    cp -r . $out/share/plannotator/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Visual plan review tool for AI coding agents";
    homepage = "https://github.com/backnotprop/plannotator";
    license = with licenses; [
      asl20
      mit
    ];
    maintainers = [ ];
  };
}
