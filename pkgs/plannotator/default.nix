{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.13.1-unstable-2026-03-16";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "03390eb2c9b8352672f57460a0518d58b41657ad";
    sha256 = "sha256-AvD7QHEveGRu/dqRWDh/g3HeMB7DgCHiP/VXpqbzj4c=";
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
