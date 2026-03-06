{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.0-unstable-2026-03-06";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "3f73ddaead3a0fc15411598703458d7be98a6a02";
    sha256 = "sha256-OE1Jv9W9l7LlqoSoVy/o5DvGdCo8li3L5mxAv6Nz2c4=";
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
