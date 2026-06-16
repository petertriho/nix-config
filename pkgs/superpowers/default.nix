{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.1.0-unstable-2026-06-15";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "8cf39006140a743dce31ba4046fceab90cc214e6";
    sha256 = "sha256-sKww11UOOHzZWxcHCprnF2+0pnuuGWIJpDoU7pxzRC4=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/superpowers
    cp -r . $out/share/superpowers/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Agentic skills framework and software development methodology";
    homepage = "https://github.com/obra/superpowers";
    license = licenses.mit;
    maintainers = [ ];
  };
}
