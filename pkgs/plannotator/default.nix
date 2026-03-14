{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.12.0-unstable-2026-03-14";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "d2238ac73624f505ca490238052140c65f7189ba";
    sha256 = "sha256-99gwbTD46uLYs721ZYtgWeQxR4m2uU2lIwT6IZ69N/o=";
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
