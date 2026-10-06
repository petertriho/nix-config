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
  version = "0.5.11-unstable-2026-10-05";

  src = fetchFromGitHub {
    owner = "k0valik";
    repo = "pi-blackhole";
    rev = "f86aa0d2edc53ea3b02fe3e9a0a130d81323178d";
    hash = "sha256-r5YNV/1tuOyLhcWGU4j+cywCoU8WG/HiZ1zgNPyf/9Q=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-fLaVwOhrgz5JN89soV81DHqDs6ooU3bt3W7adJI8zTo=";
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
