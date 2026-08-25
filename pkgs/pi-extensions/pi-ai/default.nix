{
  lib,
  buildNpmPackage,
  runCommand,
  nodejs_24,
  llm-agents,
}:
let
  version = "0.84.3";
  piVersion = llm-agents.pi.version;
in
assert lib.assertMsg (version == piVersion) ''
  pi-ai (${version}) must match pkgs.llm-agents.pi (${piVersion}).
  The extension loads a patched copy of pi-ai's codex protocol alongside pi's own
  embedded copy; drift risks silent wire-protocol corruption.
  Update version + dependency pin in pkgs/pi-extensions/pi-ai/package.json,
  regenerate package-lock.json, then refresh npmDepsHash.
'';
buildNpmPackage {
  pname = "pi-ai-runtime";
  inherit version;

  # A wrapper package whose sole dependency is @earendil-works/pi-ai, existing
  # only to materialise it as a real node_modules tree on disk. Nothing here is
  # upstream source, so the "src" is just the two vendored manifests.
  # devDependencies are kept out of the lock entirely rather than merely omitted
  # at install time: fetchNpmDeps prefetches every tarball the lock references.
  src = runCommand "pi-ai-runtime-src" { } ''
    mkdir -p $out
    cp ${./package.json} $out/package.json
    cp ${./package-lock.json} $out/package-lock.json
  '';

  nodejs = nodejs_24;
  npmDepsHash = "sha256-JLSD7Wh/eX6SvnSq4Rn4WEd1Xtj8ioepXL0zuNP6ctk=";
  npmDepsFetcherVersion = 2;

  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  meta = {
    description = "On-disk @earendil-works/pi-ai runtime for pi extensions that patch pi-ai internals";
    homepage = "https://github.com/earendil-works/pi";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
