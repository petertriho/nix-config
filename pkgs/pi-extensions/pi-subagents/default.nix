{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "pi-subagents";
  version = "0.14.3-unstable-2026-08-05";

  src = fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-subagents";
    rev = "2966cd5a33c0640de9698b56a39c11f83207a835";
    hash = "sha256-U/0xMv6UP9fmeKgO1CqSyHZfovmEDevQDIQWdFHwnO8=";
  };

  # Upstream package-lock.json records the @earendil-works/* peerDependencies
  # (and pi-coding-agent's own nested peers) with `resolved` but no `integrity`,
  # which panics nixpkgs' npm fetcher lockfile parser. Pi injects those peers at
  # runtime, so we vendor a package.json with peerDependencies stripped plus the
  # matching lockfile regenerated from it (mirrors pi-web-access). Dev deps are
  # retained in the lockfile but pruned at install via --omit=dev.
  postPatch = ''
    cp ${./package-no-peers.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';

  nodejs = nodejs_24;
  npmDepsHash = "sha256-GgvYzpdKXmJ2t7kfyd+qI2k5uOBzuL7M9D8zKzAj0NU=";
  npmDepsFetcherVersion = 2;

  # pi.extensions = ["./src/index.ts"]; pi loads the TypeScript directly, so
  # the upstream `tsc` build (→ dist/) is never consumed. Only the 3 runtime
  # deps (@sinclair/typebox, croner, nanoid) are installed; biome/typescript/
  # vitest are pruned via --omit=dev. The @earendil-works/* peerDependencies
  # are injected by pi at runtime and kept out of the closure.
  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  # buildNpmPackage installs the package under its scoped package.json name
  # (@tintinweb/pi-subagents); piPackageRoot in pi.nix resolves the unscoped
  # lib/node_modules/pi-subagents path, so relocate the directory to match.
  # The nested node_modules (croner/nanoid/@sinclair) moves with it, keeping
  # src/index.ts's imports resolvable.
  postInstall = ''
    mv $out/lib/node_modules/@tintinweb/pi-subagents $out/lib/node_modules/pi-subagents
    rmdir $out/lib/node_modules/@tintinweb
  '';

  meta = {
    description = "Claude Code-style autonomous sub-agents extension for Pi";
    homepage = "https://github.com/tintinweb/pi-subagents";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
