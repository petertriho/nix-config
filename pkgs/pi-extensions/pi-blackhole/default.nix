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
  version = "0.5.16-unstable-2026-10-24";

  src = fetchFromGitHub {
    owner = "k0valik";
    repo = "pi-blackhole";
    rev = "92f7ba10875dcc250482369953b8b1d8b6276efd";
    hash = "sha256-Rl9/zS4EyS3xD+E5so6SUgnCwRDrjcKgWQbb2bWdkL8=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-WpSj1yyZGhThB9tjnTBFBrLOkaFTBOjQKAtEDR5i6Sc=";
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
