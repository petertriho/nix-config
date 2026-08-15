{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "pi-web-access";
  version = "0.23.0-unstable-2026-08-15";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "c77b28221d527f298d409d7e61ade661e548f50c";
    hash = "sha256-q/TZUkgeC/W/Ft7RMVIDc6m/Dsj2amicHhSeCbzk05E=";
  };

  # Upstream gitignores its lockfile, so a reproducible one is vendored here.
  # Pi injects the @earendil-works/* peerDependencies at runtime, so the
  # vendored lockfile + package-no-peers.json were generated with
  # peerDependencies stripped — this keeps the FOD to the 7 real runtime deps
  # instead of pulling in the entire LLM/AWS provider trees those peers drag in.
  # devDependencies are stripped too, not just omitted at install time:
  # fetchNpmDeps prefetches every tarball the lockfile references, and
  # --omit=dev only prunes the *install*, so typescript/@types/turndown still
  # had to be downloaded. That makes the build hostage to unrelated tooling —
  # an unpublished @biomejs/biome release broke pi-tasks exactly this way.
  # Otherwise package-no-peers.json is upstream package.json unchanged; the
  # pi.extensions entry point and all other fields are preserved.
  postPatch = ''
    cp ${./package-no-peers.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';

  nodejs = nodejs_24;
  npmDepsHash = "sha256-0JP0jvk0WXVh2O7A0Ip2S5BVxr7pq0R2JKFoGM5mr+E=";
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
