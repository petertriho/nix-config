{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.4-unstable-2026-03-10";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "b6bec6943b4222b1e61b1e8daa34f5a58a356db5";
    sha256 = "sha256-G9mw5Fc0WPrGKPDRQgHDxZLwDSF8qa6a7YXANwVlN5Q=";
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
