{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.14.1-unstable-2026-03-19";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "6d452e420f82942e93d3c9ced197196d80a0d165";
    sha256 = "sha256-D2h/a3AlCcucmMwKaTGS+epCl6FgFvdmA8icCnruEAA=";
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
