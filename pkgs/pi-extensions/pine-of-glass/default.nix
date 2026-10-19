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
  version = "0.18.1-unstable-2026-10-18";

  src = fetchFromGitHub {
    owner = "tmustier";
    repo = "pine-of-glass";
    rev = "a78d294d56a9a61187c2bf6e071ff2b577098bfd";
    hash = "sha256-W7Jj1i2nrHD+J8YkQWTO/Lh2FGcTNMEhTehqnmyjxxE=";
  };

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
