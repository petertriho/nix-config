{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-subagents";
  version = "0.17.0-unstable-2026-08-18";

  src = fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-subagents";
    rev = "929d2b680089ef8174ce2254884ff55e7889c3bf";
    hash = "sha256-hXEq5LgmXS2wixwRszVC8WGTkvsfTUsniSZT4uqEPjw=";
  };

  # Upstream package-lock.json records the @earendil-works/* peerDependencies
  # (and pi-coding-agent's own nested peers) with `resolved` but no
  # `integrity`, which panics nixpkgs' npm fetcher lockfile parser. Pi injects
  # those peers at runtime, so package.json is stripped in place (upstream's
  # copy — nothing vendored, so pi.extensions/files track the pinned rev) and
  # the lockfile regenerated from the stripped manifest is vendored instead.
  #
  # devDependencies are stripped from package.json, not just omitted at
  # install time: fetchNpmDeps prefetches every tarball the lockfile
  # references, and --omit=dev only prunes the *install*. Keeping them made the
  # build hostage to unrelated tooling — @biomejs/biome 2.5.7 being unpublished
  # from npm broke pi-tasks this way. 87 of the 90 locked packages were
  # dev-only.
  postPatch = stripNpmManifest { lockfile = ./package-lock.json; };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-zHqqbdug5bMfa5Tt9UMLA6MsM5AI5ZJ6AbuBw/CLl+g=";
  npmDepsFetcherVersion = 2;

  # pi.extensions = ["./src/index.ts"]; pi loads the TypeScript directly, so
  # the upstream `tsc` build (→ dist/) is never consumed. That leaves the 3
  # runtime deps (@sinclair/typebox, croner, nanoid) as the whole closure;
  # biome/typescript/vitest are gone from the manifest entirely (see
  # postPatch). The @earendil-works/* peerDependencies are injected by pi at
  # runtime and kept out of the closure.
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
