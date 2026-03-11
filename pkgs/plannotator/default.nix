{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.4-unstable-2026-03-11";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "41059d8e4383af700bde1c0932252594e0f419eb";
    sha256 = "sha256-LTi5nac7BDrBOA6au7Y8uYZGiWfYzBuBi2VEre9HBr8=";
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
