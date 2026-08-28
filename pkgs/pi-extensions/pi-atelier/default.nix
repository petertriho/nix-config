{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-atelier";
  version = "0.8.2-unstable-2026-08-27";

  src = fetchFromGitHub {
    owner = "michaelmjhhhh";
    repo = "pi-atelier";
    rev = "5ca4cfcc7b23f25ff19f140636431bd1f0dad82f";
    hash = "sha256-jepFHUOMMOK5LO6P98em7EsT9ErN3BGsUgkg719FXjk=";
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
