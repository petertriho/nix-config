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
    rev = "d7ccc55f33a33ad092acdb83d28e39ccbde3b37b";
    sha256 = "sha256-Fj4dlxcUb0m+WezTBp6KX7zE6yx9an9vdrI1bfq2wlU=";
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
