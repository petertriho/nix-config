{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-context-view";
  version = "0.7.1-unstable-2026-10-13";

  src = fetchFromGitHub {
    owner = "dimk90";
    repo = "pi-context-view";
    rev = "959404d8ac156b40f5ce8024d322c1bc3b835464";
    hash = "sha256-BYj7B+msJfNRvRuOR3MYZUgvyCPKP4ZQt+mX1eERQkM=";
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
