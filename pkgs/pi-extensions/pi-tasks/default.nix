{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "pi-tasks";
  version = "0.7.2-unstable-2026-07-22";

  src = fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-tasks";
    rev = "03a13011eb7bfb63d6d348959fe738ab7365ea75";
    hash = "sha256-aKCJKkl1jmAQ17eJ6wmnu6cjhwY2t3PB0yIqyYgqQHY=";
  };

  # Upstream package-lock.json records the @earendil-works/* peerDependencies
  # (and pi-coding-agent's own nested peers) with `resolved` but no `integrity`,
  # which panics nixpkgs' npm fetcher lockfile parser. Pi injects those peers at
  # runtime, so we vendor a package.json with peerDependencies stripped plus the
  # matching lockfile regenerated from it (mirrors pi-subagents / pi-web-access).
  #
  # devDependencies are stripped from the vendored package.json too, not just
  # omitted at install time: fetchNpmDeps prefetches every tarball the lockfile
  # references, and --omit=dev only prunes the *install*, so dev deps still had
  # to be downloaded. That made the build hostage to unrelated tooling — it
  # broke when @biomejs/biome 2.5.7 was unpublished from npm (403 on the
  # tarball). Regenerate both files together with:
  #   npm install --package-lock-only --ignore-scripts
  postPatch = ''
    cp ${./package-no-peers.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';

  nodejs = nodejs_24;
  npmDepsHash = "sha256-X75nWsqOYrTz3TXM4cy5J2E00ozIkTCJeg+OoKmWAgs=";
  npmDepsFetcherVersion = 2;

  # pi.extensions = ["./src/index.ts"]; pi loads the TypeScript directly, so
  # the upstream `tsc` build (→ dist/) is never consumed. That leaves typebox as
  # the only dep the closure needs; biome/typescript/vitest are gone from the
  # vendored package.json entirely (see postPatch). The @earendil-works/*
  # peerDependencies are injected by pi at runtime and kept out of the closure.
  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  # buildNpmPackage installs the package under its scoped package.json name
  # (@tintinweb/pi-tasks); piPackageRoot in pi.nix resolves the unscoped
  # lib/node_modules/pi-tasks path, so relocate the directory to match. The
  # nested node_modules (typebox) moves with it, keeping src/index.ts's
  # imports resolvable.
  postInstall = ''
    mv $out/lib/node_modules/@tintinweb/pi-tasks $out/lib/node_modules/pi-tasks
    rmdir $out/lib/node_modules/@tintinweb
  '';

  meta = {
    description = "Claude Code-style task tracking and coordination extension for Pi";
    homepage = "https://github.com/tintinweb/pi-tasks";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
