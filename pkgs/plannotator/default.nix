{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.10.0-unstable-2026-03-03";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "c7ae789a554ee8973ee94fbe9741f7d2efeb040f";
    sha256 = "sha256-43RAtl2QuBtsgnCsTBJlrKsF3CuJVQ/0tq20A2RvXPY=";
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
