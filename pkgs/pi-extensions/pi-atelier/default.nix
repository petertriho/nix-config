{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-atelier";
  version = "0.7.0-unstable-2026-08-03";

  src = fetchFromGitHub {
    owner = "michaelmjhhhh";
    repo = "pi-atelier";
    rev = "d78f1d113814af4eee6deb9f4418f96cf50c66fa";
    hash = "sha256-Nap5MJmf3iTJ8CauInmsHQgA5Wwa9NdkI8xr97tu9HA=";
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
