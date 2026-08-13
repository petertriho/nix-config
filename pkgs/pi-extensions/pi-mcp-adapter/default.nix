{
  lib,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  autoPatchelfHook,
  zlib,
}:
buildNpmPackage {
  pname = "pi-mcp-adapter";
  version = "2.24.0-unstable-2026-08-13";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "3d953f9096bf8af05783a740c6608663a2c3180a";
    hash = "sha256-wFe2SJ7M38iQrGwYxqHJN2lTitYrmRlRZlwJkCrUfco=";
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
  # way). So the vendored files are upstream's with every dev-only entry pruned,
  # production pins untouched.
  #
  # Stripping them also removes the three @earendil-works/* entries that record
  # `resolved` with no `integrity` (which panics nixpkgs' lockfile parser), so
  # the integrity values no longer need patching in by hand. Those are
  # peerDependencies that pi injects at runtime; they were already dev-flagged
  # and pruned from the install, so the closure is unchanged.
  postPatch = ''
    cp ${./package-no-peers.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';

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
