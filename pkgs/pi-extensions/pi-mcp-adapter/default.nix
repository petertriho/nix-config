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
  # NOTE: revs past 5c1ea6b pinned @modelcontextprotocol/client+core to
  # https://pkg.pr.new/... PR-preview tarballs, which fetchNpmDeps cannot
  # prefetch for the offline install (ENOTCACHED, only-if-cached). 0e88e19
  # (2.36.0) was verified free of pkg.pr.new refs before bumping; re-check
  # on the next bump and regenerate the vendored lockfile alongside it.
  version = "2.37.0-unstable-2026-09-23";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "86f3e201446c3d6e88cb47809472b7d0d20c1634";
    hash = "sha256-j/PrLaZHIbiHs7W0lHWEC/Q6M/w8ASK8CzlLumbWrZg=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-3ZttAsJOaQPiZ1DT1I1Z01z2/bSVo5Jn1bmEK1lTNag=";
  npmDepsFetcherVersion = 2;
  # Upstream (post-2.27.0) added `prepare: npm run build:public` — tsc
  # emitting dist/ declaration files for embedding hosts that import the
  # adapter as a library. The install hook runs `npm pack`, which fires
  # `prepare`, and tsc is absent because devDependencies are stripped above;
  # the failed pack then breaks the hook's jq parse and file copy. Pi loads
  # the .ts sources directly, so dist/ is not needed (the pi-lens /
  # pi-agent-browser-native pattern).
  npmPackFlags = [ "--ignore-scripts" ];

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
