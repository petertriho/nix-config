{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-context-view";
  version = "0.8.0-unstable-2026-10-24";

  src = fetchFromGitHub {
    owner = "dimk90";
    repo = "pi-context-view";
    rev = "dac576735e86313eaa92dce59a41796a252830a7";
    hash = "sha256-XzqWHwmRv4Bf9XZ+doYNdZ9zGDjTlbrD7T+38+CRUJI=";
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
