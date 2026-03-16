{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.12.0-unstable-2026-03-16";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "93c0f035b3f9303b4c8f725930656cb216043f71";
    sha256 = "sha256-D4GcyQWVg667Im2gDOK2ivyuLmrdZUXk73NCv2DAqEo=";
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
