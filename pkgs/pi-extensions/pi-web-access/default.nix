{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-web-access";
  version = "0.25.0-unstable-2026-08-26";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "6559ab29ddb881d099d16b05612e7589afc678f3";
    hash = "sha256-3r8steyZxwmifbJKTdz+RPnj/TttT6+1uQW2d3NGrb8=";
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
