{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-atelier";
  version = "0.10.0-unstable-2026-08-28";

  src = fetchFromGitHub {
    owner = "michaelmjhhhh";
    repo = "pi-atelier";
    rev = "ee17beaaf0a1513869157ce6dc9aaadf423cf2f0";
    hash = "sha256-+ObvmyUcdiqrajVKM+vsfE4Nb25GInp4TzmqXG0pzZU=";
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
