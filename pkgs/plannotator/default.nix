{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.14.4-unstable-2026-03-21";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "c5204770d2214b2cba337746bca841199518b169";
    sha256 = "sha256-O4tJjsfY7/0yno7F28O56spzEkSFmJpiyzg51rGDuPA=";
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
