{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.13.1-unstable-2026-03-18";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "6b775ea1ed7b4f956cc3a67022c78c68243f0dcd";
    sha256 = "sha256-lsRlV139jqF9GtG6LOnOO/pWiRT2uUqVtQeP9s1suP4=";
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
