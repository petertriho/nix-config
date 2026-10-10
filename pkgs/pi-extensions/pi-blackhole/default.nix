{
  buildNpmPackage,
  fetchFromGitHub,
  lib,
  nodejs_24,
  stripNpmManifest,
  updateNpmLock,
}:
buildNpmPackage (finalAttrs: {
  pname = "pi-blackhole";
  version = "0.5.12-unstable-2026-10-08";

  src = fetchFromGitHub {
    owner = "k0valik";
    repo = "pi-blackhole";
    rev = "a2e4c136bb0e8775cca0e8b2583f5d24e86776fb";
    hash = "sha256-mEnlgfTdg93btpnJ0/OUB4pbk6JCZhovzeGewOzsRUU=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-u/JlV3a4ps0maFHGa8FYK6Iym8ii8J9e/P7pyBiVOrQ=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];
  npmInstallFlags = [ "--ignore-scripts" ];

  # Pi supplies the runtime peers; tsup and its TypeScript peer build the entry.
  postPatch = stripNpmManifest {
    stripFields = [
      "peerDependencies"
      "peerDependenciesMeta"
    ];
    extraJqOps = [
      ''.devDependencies |= with_entries(select(.key == "tsup" or .key == "typescript"))''
    ];
    lockfile = ./package-lock.json;
  };
  passthru.updateScript = updateNpmLock {
    inherit (finalAttrs)
      pname
      src
      postPatch
      npmDepsFetcherVersion
      ;
  };

  buildPhase = ''
    runHook preBuild
    ./node_modules/.bin/tsup
    test -f dist/index.js
    runHook postBuild
  '';

  meta = {
    description = "Unified Pi compaction and observational memory extension";
    homepage = "https://github.com/k0valik/pi-blackhole";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
  };
})
