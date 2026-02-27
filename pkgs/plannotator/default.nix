{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.9.3-unstable-2026-02-27";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "af18db7aab8d89ec3c83a27d036b3c5155b4e23e";
    sha256 = "sha256-gZZXSYfkVqiunQJaG8Ki4p2zFP5UpXM1t44wNLVjuIs=";
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
