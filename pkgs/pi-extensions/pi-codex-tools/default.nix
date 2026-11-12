{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
  updateNpmLock,
}:
let
  src = fetchFromGitHub {
    owner = "jvm";
    repo = "pi-mono";
    rev = "a916305a98d6ad5c54b3f43f34d9793f9960d931";
    hash = "sha256-dxWo30k5tdaP13awT7JmXrfXGyTSAymECJJvu2C/13M=";
  };
in
buildNpmPackage (finalAttrs: {
  pname = "pi-codex-tools";
  version = "pi-skillful@0.5.2-unstable-2026-11-12";
  inherit src;

  sourceRoot = "${src.name}/packages/pi-codex-tools";

  # Pi loads the upstream TypeScript directly. Strip the monorepo development
  # and Pi-injected peer dependency trees while retaining upstream's package
  # metadata, files list, and pi.extensions entry. The vendored lockfile was
  # generated from that stripped manifest with npm scripts disabled and
  # contains only runtime dependencies.
  postPatch = stripNpmManifest { lockfile = ./package-lock.json; };
  passthru.updateScript = updateNpmLock {
    inherit (finalAttrs) pname src postPatch sourceRoot npmDepsFetcherVersion;
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-WoG/XpCx62Oz/RH9W7UfYfNnJXPlBr3u/jYBNbzFjpg=";
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
})
