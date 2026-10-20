{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-context-view";
  version = "0.7.2-unstable-2026-10-18";

  src = fetchFromGitHub {
    owner = "dimk90";
    repo = "pi-context-view";
    rev = "6aa79e334c4dc8762667d508e8d2f81942762472";
    hash = "sha256-3v9sX/5C61OMtInavgUjmEJlj1/2X48eKxQCLJFfKO4=";
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
