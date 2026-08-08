{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-atelier";
  version = "0.8.0-unstable-2026-08-07";

  src = fetchFromGitHub {
    owner = "michaelmjhhhh";
    repo = "pi-atelier";
    rev = "023628034582a8811fcf2c86a67d492cf9666665";
    hash = "sha256-z314e4TuebZaCLxqoWSoaSeTIIP5nk+C67VgRrT+y/Q=";
  };

  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-atelier
    mkdir -p "$packageRoot"
    cp package.json README.md CHANGELOG.md LICENSE "$packageRoot/"
    cp -r extensions src assets "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Status rail and activity sidebar extension for Pi";
    homepage = "https://github.com/michaelmjhhhh/pi-atelier";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
