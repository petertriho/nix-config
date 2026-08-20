{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-atelier";
  version = "0.8.2-unstable-2026-08-19";

  src = fetchFromGitHub {
    owner = "michaelmjhhhh";
    repo = "pi-atelier";
    rev = "159f34cf440c18cba847999a191b252b4574b57d";
    hash = "sha256-itkils765ZsjEkwoyNse0fGqLhNP7Y3e2w1WTQoXSg8=";
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
