{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
let
  src = fetchFromGitHub {
    owner = "jvm";
    repo = "pi-mono";
    rev = "3e45d80d7d7ca89581710cc05e2e343cd1380348";
    hash = "sha256-sp+sZGxH2KVfVRF3hw+LMs9HaCUNQG3zr12s1Ip/x5Y=";
  };
in
buildNpmPackage {
  pname = "pi-codex-tools";
  version = "pi-web-kit@0.3.0-unstable-2026-09-18";
  inherit src;

  sourceRoot = "${src.name}/packages/pi-codex-tools";

  # Pi loads the upstream TypeScript directly. Strip the monorepo development
  # and Pi-injected peer dependency trees while retaining upstream's package
  # metadata, files list, and pi.extensions entry. The vendored lockfile was
  # generated from that stripped manifest with npm scripts disabled and
  # contains only the two runtime dependencies.
  postPatch = stripNpmManifest { lockfile = ./package-lock.json; };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-lEtDWRfWsAnLe3Bi64t87p8a9qQb3vRHHx6Vg7vrxHU=";
  npmDepsFetcherVersion = 2;

  # Ignore lifecycle scripts so npm never attempts a native build. Disable npm
  # workspace traversal because the package's read-only fetched parent is the
  # pi-mono workspace root; dependencies belong beside this package instead.
  npmFlags = [
    "--ignore-scripts"
    "--workspaces=false"
  ];

  # No TypeScript or native build is needed: Linux uses the secure /proc path,
  # while upstream ships both Darwin N-API prebuilds in the package files.
  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  # The unscoped package name installs directly at the path piPackageRoot uses:
  # $out/lib/node_modules/pi-codex-tools. npm pack respects upstream's files
  # list, preserving native/, both prebuilds/ trees, and package metadata.

  meta = {
    description = "Codex-compatible apply_patch tooling for Pi's grammar-capable OpenAI models";
    homepage = "https://github.com/jvm/pi-mono/tree/main/packages/pi-codex-tools#readme";
    license = lib.licenses.asl20;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
