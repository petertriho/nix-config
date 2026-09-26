{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
  # Toggle each bundled sub-extension. Pi discovers sub-extensions through
  # the `pi.extensions` array in package.json, so a disabled part is dropped
  # from that array at install time. Its directory is still copied, so it
  # stays loadable by hand via `pi -ne -e <path>` for bisecting.
  # Example: pine-of-glass.override { enableTraceline = false; }
  enableContextimate ? true,
  enableTraceline ? true,
  enableCachemire ? true,
  enableMeantime ? true,
}:
stdenvNoCC.mkDerivation (let
  enabledExtensions =
    lib.optional enableContextimate "./extensions/pi-contextimate"
    ++ lib.optional enableTraceline "./extensions/pi-traceline"
    ++ lib.optional enableCachemire "./extensions/pi-cachemire"
    ++ lib.optional enableMeantime "./extensions/pi-meantime";
 in {
  pname = "pine-of-glass";
  # The requested current-main snapshot also carries the v0.12.1 tag.
  version = "0.12.1-unstable-2026-09-24";

  src = fetchFromGitHub {
    owner = "tmustier";
    repo = "pine-of-glass";
    rev = "36cf166cf56fb28a0753e37938fb933b17055cdb";
    hash = "sha256-mYxJmpm8qFyNE82G6MwatfzYEQQ81l08d+zZro5ONfQ=";
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

    # Keep only the enabled sub-extensions in the manifest pi reads.
    ${jq}/bin/jq --argjson extensions '${builtins.toJSON enabledExtensions}' \
      '.pi.extensions = $extensions' "$packageRoot/package.json" > "$packageRoot/package.json.filtered"
    mv "$packageRoot/package.json.filtered" "$packageRoot/package.json"

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
})
