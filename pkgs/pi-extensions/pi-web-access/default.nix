{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-web-access";
  version = "0.24.2-unstable-2026-08-22";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "846949c645efadd6314f25eef60b390b0669704a";
    hash = "sha256-GWP1lpBkCzzET4EcsigH50k988DDNry3AB9PE6p+zRU=";
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
  npmDepsHash = "sha256-Lzmsc94uP3B7O/G63f09So6lo1Az3Z9ajQNlOs5YkqY=";
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
