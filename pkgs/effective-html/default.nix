{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-08-03";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "d95debbaef15af1d201fc6c10c77cf92b524a0d6";
    hash = "sha256-5j212fdzcLd3yG6cUOpcZPLaLFevlBBqtEyay2tCKXk=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/effective-html
    cp -r skills $out/share/effective-html/

    runHook postInstall
  '';

  meta = with lib; {
    description = "HTML design skills for AI coding agents";
    homepage = "https://github.com/plannotator/effective-html";
    license = licenses.mit;
    maintainers = [ ];
  };
}
