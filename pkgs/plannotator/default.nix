{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.0-unstable-2026-03-05";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "7110f14f568e71d550332cc043d2d0177e9d75d6";
    sha256 = "sha256-MWbvNbYnTwpcLi5YyZoh0EfKCJkbNjrudpPebGqYB3w=";
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
