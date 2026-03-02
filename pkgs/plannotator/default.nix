{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.9.3-unstable-2026-03-02";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "bf4589e395188aea159cbde9aefe936aafa8b6a1";
    sha256 = "sha256-ac9Y79EJFmfOevYxcFRnDDy//+tjEh079SPI3KwTUyY=";
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
