{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.12.0-unstable-2026-03-12";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "8b8487db3ef4837b9968a8fbf0e28a965ded0248";
    sha256 = "sha256-suhA99KrSUCGKXfJszjcEikkXXX/KD/ovGHGXW+IuQQ=";
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
