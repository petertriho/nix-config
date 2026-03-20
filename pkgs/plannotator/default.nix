{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.14.3-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "d0ebca45eba303eadd29308cbc9b44e88db10eba";
    sha256 = "sha256-JgEryiEQsn7Lcc/ECqqZtK7+bJ7TJEhOVVe3wb/LSaE=";
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
