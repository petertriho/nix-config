{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-dynamic-workflows";
  version = "3.6.0-unstable-2026-08-16";

  src = fetchFromGitHub {
    owner = "QuintinShaw";
    repo = "pi-dynamic-workflows";
    rev = "f1e05aa766b729788e9c53892cfa0dd940aa36e1";
    hash = "sha256-uilOmVpOagOSUjqkpTglSKTraTvf3wEku3G2v+BoQXY=";
  };

  # Upstream package-lock.json records @earendil-works/* peerDependencies
  # (and pi-coding-agent's own nested peers) with `resolved` but no
  # `integrity`, which panics nixpkgs' npm fetcher lockfile parser. Pi injects
  # those peers at runtime, so package.json is stripped in place (upstream's
  # copy — nothing vendored, so pi.extensions/files track the pinned rev) and
  # the lockfile regenerated from the stripped manifest is vendored instead.
  #
  # All devDependencies are stripped, not just omitted at install time:
  # fetchNpmDeps prefetches every tarball the lockfile references, and
  # --omit=dev only prunes the *install*. That made the build hostage to
  # unrelated tooling — it broke outright when tsx 4.23.7 was unpublished from
  # npm (403 on the tarball). 62 of the 63 locked packages were dev-only.
  postPatch = stripNpmManifest { lockfile = ./package-lock.json; };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-4+vEahhQw01C9hzZalb6HSW9NHFjmIkL2GPgQ3vACn4=";
  npmDepsFetcherVersion = 2;

  # pi.extensions = ["extensions/workflow.ts"]; pi loads the TypeScript directly
  # (the entry imports ../src/index.js, resolved to ../src/index.ts under
  # NodeNext + pi's loader), so the upstream `tsc` build (→ dist/) is never
  # consumed. That leaves acorn as the only dep the closure needs; biome/tsx/
  # typescript/fast-check/typebox are gone from the manifest entirely (see
  # postPatch). The @earendil-works/* peerDependencies are injected by pi at
  # runtime and kept out of the closure.
  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  # buildNpmPackage installs the package under its scoped package.json name
  # (@quintinshaw/pi-dynamic-workflows); piPackageRoot in pi.nix resolves the
  # unscoped lib/node_modules/pi-dynamic-workflows path, so relocate the
  # directory to match. The nested node_modules (acorn) moves with it,
  # keeping src/workflow.ts's `import { parse } from "acorn"` resolvable.
  postInstall = ''
    mv $out/lib/node_modules/@quintinshaw/pi-dynamic-workflows $out/lib/node_modules/pi-dynamic-workflows
    rmdir $out/lib/node_modules/@quintinshaw
  '';

  meta = {
    description = "Dynamic JavaScript workflow orchestration for Pi — fan out across subagents with model routing, resume, and worktree isolation";
    homepage = "https://github.com/QuintinShaw/pi-dynamic-workflows";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
