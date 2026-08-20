{
  lib,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  autoPatchelfHook,
  zlib,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-mcp-adapter";
  version = "2.26.1-unstable-2026-08-20";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "c59698e4be47fa14f6598541f723471e4ee0b31f";
    hash = "sha256-oX3XLGDPBagOpQ7buUqkYMZWU0EPHdMla1c2auXXRv0=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-uR3MQutnIMiaQBhVogjav3TwfeTAoKcRacz360t7DF0=";
  npmDepsFetcherVersion = 2;

  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  # Upstream's lockfile pulls its whole dev tree — @earendil-works/pi-coding-agent
  # and the AWS/Anthropic/Google provider SDKs it depends on — which was 344 of
  # the 475 locked packages. fetchNpmDeps prefetches every tarball the lockfile
  # references and --omit=dev only prunes the *install*, so all 344 were
  # downloaded and then discarded, leaving the build hostage to unrelated
  # tooling (an unpublished @biomejs/biome release broke pi-tasks exactly this
  # way). So package.json is stripped in place — dev + peer deps dropped,
  # production pins untouched — and the lockfile regenerated from the stripped
  # manifest is vendored.
  #
  # Stripping also removes the three @earendil-works/* entries that record
  # `resolved` with no `integrity` (which panics nixpkgs' lockfile parser);
  # they are peerDependencies that pi injects at runtime, already dev-flagged
  # and pruned from the install, so the closure is unchanged. Because
  # package.json now flows from upstream at the pinned rev, its `files`
  # whitelist tracks upstream automatically — files upstream adds no longer
  # need re-vendoring on the next bump (2.26.0 broke exactly this way over
  # agent-plugin-loader.ts).
  postPatch = stripNpmManifest { lockfile = ./package-lock.json; };

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    stdenv.cc.cc.lib
    zlib
  ];

  meta = {
    description = "MCP adapter extension for the Pi coding agent";
    homepage = "https://github.com/nicobailon/pi-mcp-adapter";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = "pi-mcp-adapter";
  };
}
