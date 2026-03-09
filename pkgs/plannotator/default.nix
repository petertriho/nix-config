{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.3-unstable-2026-03-09";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "c19097dc52bca55b8d2dadf7b5fecfadbd391488";
    sha256 = "sha256-ozPV8PyjBrSWv38X8eOKQj9TbRiuAawK1IZpopNlZt4=";
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
