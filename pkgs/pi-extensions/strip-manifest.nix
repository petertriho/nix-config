# Shared postPatch fragment for the buildNpmPackage-based pi extensions.
#
# Why package.json gets rewritten at all: these extensions declare the
# @earendil-works/* packages as peerDependencies, which pi injects at runtime,
# and upstream lockfiles record them (and pi-coding-agent's own nested peers)
# with `resolved` but no `integrity` — that panics nixpkgs' npm fetcher
# lockfile parser. devDependencies are dropped as well because fetchNpmDeps
# prefetches every tarball the lockfile references: --omit=dev only prunes the
# *install*, so keeping them made builds hostage to unrelated tooling (an
# unpublished @biomejs/biome release broke pi-tasks exactly this way).
#
# Why jq instead of a vendored package-*.json copy: the vendored copies went
# stale on every rev bump (version/description/files drift). Stripping
# upstream's package.json in place keeps every field — pi.extensions, files,
# bin — tracking the pinned rev automatically. Only the lockfile stays
# vendored, because it cannot be regenerated inside the sandbox.
#
# jq is referenced by store path, not by name: postPatch is replayed verbatim
# inside the fetchNpmDeps fixed-output derivation, where PATH holds only the
# fetcher's tools.
#
# After a rev bump that changes dependencies, regenerate the vendored lockfile:
#   jq '<filter from this file / the package's postPatch>' package.json \
#     > package.json.stripped && mv package.json.stripped package.json
#   cp <nix-config>/pkgs/pi-extensions/<pkg>/package-lock.json .
#   npm install --package-lock-only --ignore-scripts   # keeps existing pins
# and copy the result back, then update npmDepsHash (fakeHash -> build -> copy
# the "got:" value, or run prefetch-npm-deps with NPM_FETCHER_VERSION=2).
{
  lib,
  jq,
}:

{
  # Top-level package.json fields to drop. The default covers the common
  # pi-extension shape: everything pi injects at runtime or the lockfile never
  # needs.
  stripFields ? [
    "devDependencies"
    "peerDependencies"
    "peerDependenciesMeta"
  ],
  # Extra jq pipeline stages appended after the del(...), for packages needing
  # finer surgery, e.g. keeping only the dev deps a --noCheck tsc build runs
  # from node_modules:
  #   extraJqOps = [ ''.devDependencies |= with_entries(select(.key == "typescript" or .key == "@types/node"))'' ]
  extraJqOps ? [ ],
  # Vendored lockfile generated from the stripped manifest.
  lockfile ? null,
}:

let
  jqProgram =
    "del("
    + lib.concatStringsSep ", " (map (field: ".${field}") stripFields)
    + ")"
    + lib.concatStringsSep "" (map (op: " | ${op}") extraJqOps);
in
''
  ${jq}/bin/jq '${jqProgram}' package.json > package.json.stripped
  mv package.json.stripped package.json
''
+ lib.optionalString (lockfile != null) ''
  cp ${lockfile} package-lock.json
''
