{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-context-view";
  version = "0.8.4-unstable-2026-11-12";

  src = fetchFromGitHub {
    owner = "dimk90";
    repo = "pi-context-view";
    rev = "bb3ab6730972a4a1a6476cdcb456bf1cb78430e9";
    hash = "sha256-ovYZjSRH5DvOCJxEEeisihUgy4sKVBpVpdwmE1UUL2c=";
  };

  dontBuild = true;

  # Pi loads the TypeScript source and supplies both declared peer dependencies.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-context-view
    mkdir -p "$packageRoot"
    cp -r src package.json README.md LICENSE "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Context usage visualization and injection inspector for Pi";
    homepage = "https://github.com/dimk90/pi-context-view";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
