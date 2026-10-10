{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
  updateNpmLock,
}:
buildNpmPackage (finalAttrs: {
  pname = "pi-subagents";
  version = "0.20.0-unstable-2026-10-09";

  src = fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-subagents";
    rev = "fd8d81618d80ae83a3faf40cb87dae99cca33264";
    hash = "sha256-D6oae5VLbtZoWnIg0hkyWKHkqGcVJ80xQg2CXef9h/Q=";
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
  passthru.updateScript = updateNpmLock {
    inherit (finalAttrs) pname src postPatch npmDepsFetcherVersion;
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-JGi4TBNymXU98f/VPRqGfCQjTMXxeeSaN5l9/li8e/A=";
  npmDepsFetcherVersion = 2;

  # pi.extensions = ["./src/index.ts"]; pi loads the TypeScript directly, so
  # the upstream `tsc` build (→ dist/) is never consumed. That leaves the 4
  # runtime deps (@sinclair/typebox, croner, nanoid, typebox) as the closure;
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
})
