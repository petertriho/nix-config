{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.7-unstable-2026-04-06";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "917e5f53b16b115b70a3a355ed5f4993b9f8b73d";
    sha256 = "sha256-FMaX6VMBC64OPdvXwhXKfHKnkdvdC2R9lZaU3BR/G3o=";
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
