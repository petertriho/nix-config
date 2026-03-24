{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.14.5-unstable-2026-03-24";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "f96758da0a376a79921f1bfada01c4e3fef3aee6";
    sha256 = "sha256-vdHMxxzaIm1ZeIvTBZ3mG025HbTbcLb6wfOXxO4qxBE=";
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
