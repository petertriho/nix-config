{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.1-unstable-2026-03-06";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "0ce299dd92cc01ae5e350bedeacec5670e1b801f";
    sha256 = "sha256-O9lV4hh8fifaObvlWpX31cjy7BEEN3OpGVZm8PiWYOU=";
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
