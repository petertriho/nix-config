{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.9.3-unstable-2026-03-01";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "c4f3479e6db809de50230c8cf55bde2d85ce39eb";
    sha256 = "sha256-M18PWUtimZagwGJxGax6HrtXL6RtxIZj6eymzXIG7Rc=";
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
