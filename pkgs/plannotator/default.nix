{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.14.5-unstable-2026-03-23";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "b545969b0045466ca55b8e51a0b5aad83f33bff2";
    sha256 = "sha256-aRU/NmEAKx/4clW63j+UGYFOF6BAs5H+hQmdvsj+C8g=";
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
