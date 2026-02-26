{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.9.2-unstable-2026-02-25";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "39b63c99c09bae41f21c9401c4eaf19148da792b";
    sha256 = "0qdw16ykpbjjp72qf3f85i1hvr623i791a9zncap5h06qmmmgfv7";
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
