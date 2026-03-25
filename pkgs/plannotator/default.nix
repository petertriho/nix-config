{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.15.2-unstable-2026-03-25";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "d49fb49281a09235d45f5fed1cb06a5e9229617f";
    sha256 = "sha256-YldJnh3KNBGJBTHrH88kEXn6TiZt64nbVvHcfZ51teo=";
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
