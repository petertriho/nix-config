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
  version = "0.5.13-unstable-2026-10-13";

  src = fetchFromGitHub {
    owner = "k0valik";
    repo = "pi-blackhole";
    rev = "1907ede09b5f81922a149ff1622a42325b60b87e";
    hash = "sha256-vElVEXnzxkMq8eema4AFXGONhlq4EJXiUGdPtkUoFQA=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-XPWLzNPo0OyBGJdTSkoQYr+RlImkfbRVTBJu7euijsc=";
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
