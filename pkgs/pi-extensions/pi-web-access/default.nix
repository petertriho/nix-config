{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-web-access";
  version = "0.24.2-unstable-2026-08-25";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "54c23531a5d249daebdccf061c9b28e65aca1d19";
    hash = "sha256-a7eIQ5ljZzWDHcP94i6cke6m05tQOKDHiGnDyVTzB6k=";
  };

  # Upstream gitignores its lockfile, so a reproducible one is vendored here.
  # Pi injects the @earendil-works/* peerDependencies at runtime, so
  # package.json is stripped in place (upstream's copy — nothing vendored, so
  # pi.extensions/files track the pinned rev) and the lockfile is generated
  # from the stripped manifest: this keeps the FOD to the real runtime deps
  # instead of pulling in the entire LLM/AWS provider trees those peers drag
  # in. devDependencies are stripped too, not just omitted at install time:
  # fetchNpmDeps prefetches every tarball the lockfile references, and
  # --omit=dev only prunes the *install*, so typescript/@types/turndown still
  # had to be downloaded. That makes the build hostage to unrelated tooling —
  # an unpublished @biomejs/biome release broke pi-tasks exactly this way.
  #
  # The lockfile covers the 0.23.0 dependency set, including undici (^8.9.0):
  # gemini-web.ts dynamic-imports it, and the previously vendored lockfile
  # predated that dep, which would have crashed the Gemini web search path at
  # runtime.
  postPatch = stripNpmManifest { lockfile = ./package-lock.json; };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-3D7w31i/NQ920VCG7cvx7PQvlYvb86J6bz77lhXp+9k=";
  npmDepsFetcherVersion = 2;

  # Upstream ships raw .ts (pi.extensions = ["./index.ts"]) with no build
  # script; Pi loads the TypeScript directly. Only runtime deps are installed.
  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  meta = {
    description = "Web search, content extraction, and video understanding extension for Pi";
    homepage = "https://github.com/nicobailon/pi-web-access";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
