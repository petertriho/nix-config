{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pine-of-glass";
  # The requested current-main snapshot also carries the v0.12.1 tag.
  version = "0.12.1-unstable-2026-09-21";

  src = fetchFromGitHub {
    owner = "tmustier";
    repo = "pine-of-glass";
    rev = "bdbcb1b8f44d58c74afce5443fda7170f9422369";
    hash = "sha256-QWT1DbKsDBFKDCNWHjdtWEoCtY1OsEEkiq6P9Uaa1FU=";
  };

  # Pi >=0.86.0 provides the optional peers and loads the raw TypeScript.
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pine-of-glass
    mkdir -p "$packageRoot/extensions" "$packageRoot/scripts"
    cp package.json README.md CHANGELOG.md LICENSE "$packageRoot/"
    cp -r docs "$packageRoot/"
    cp -r extensions/_lib extensions/pi-{contextimate,traceline,cachemire,meantime} "$packageRoot/extensions/"
    cp -r scripts/contextimate "$packageRoot/scripts/"

    runHook postInstall
  '';

  meta = {
    description = "Context, trace, cache, and tempo extensions for Pi";
    homepage = "https://github.com/tmustier/pine-of-glass";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
