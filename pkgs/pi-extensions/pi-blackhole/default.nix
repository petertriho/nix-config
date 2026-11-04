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
  version = "0.5.17-unstable-2026-11-03";

  src = fetchFromGitHub {
    owner = "k0valik";
    repo = "pi-blackhole";
    rev = "c0e282ae1938eaf8eb9faae6e473e3a1027b5c1f";
    hash = "sha256-6JYZh4/9k2aAs9kjTUPyQez9Y/DrZombq+V1N8GHyRk=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-hf5ACRZernRtk9W1q4FCvqmdVyL/rxR8injKmUaiSQg=";
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
