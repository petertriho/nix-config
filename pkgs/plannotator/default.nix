{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.10.0-unstable-2026-03-04";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "d9c2d4611308d0ac11afd7594a1aed7d30d15074";
    sha256 = "sha256-T91ol2BZ7KVcu71eQRvpE/gsMr+uvd5cuNg/McLCXiQ=";
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
