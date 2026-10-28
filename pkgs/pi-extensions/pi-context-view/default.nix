{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-context-view";
  version = "0.8.1-unstable-2026-10-27";

  src = fetchFromGitHub {
    owner = "dimk90";
    repo = "pi-context-view";
    rev = "7f6fd02074df8cd69caa08a29db8fbe30be35aee";
    hash = "sha256-J8Qsyn/6eA2ZfSzT3r+OxGHOAmJhWVj7J8x8TQk4WL8=";
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
