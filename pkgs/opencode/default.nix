# https://github.com/NixOS/nixpkgs/blob/master/pkgs/by-name/op/opencode/package.nix
{
  lib,
  stdenvNoCC,
  buildGoModule,
  bun,
  fetchFromGitHub,
  models-dev,
  nix-update-script,
  testers,
  writableTmpDirAsHomeHook,
  ...
}:
let
  opencode-node-modules-hash = {
    "aarch64-darwin" = "sha256-4m7rvptGFLTtBNrN7b/r8raYXl5jMX+GCzu+0rPbx/s=";
    "aarch64-linux" = "sha256-4xAPOR4xgqpT95vlfX1q2YA7iZZg3axAigxp32vlm48=";
    "x86_64-darwin" = "sha256-4m7rvptGFLTtBNrN7b/r8raYXl5jMX+GCzu+0rPbx/s=";
    "x86_64-linux" = "sha256-4xAPOR4xgqpT95vlfX1q2YA7iZZg3axAigxp32vlm48=";
  };
  bun-target = {
    "aarch64-darwin" = "bun-darwin-arm64";
    "aarch64-linux" = "bun-linux-arm64";
    "x86_64-darwin" = "bun-darwin-x64";
    "x86_64-linux" = "bun-linux-x64";
  };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "opencode";
  version = "unstable-2025-08-05";
  src = fetchFromGitHub {
    owner = "sst";
    repo = "opencode";
    rev = "a48274f82b95eb5a2f68d94a1cfa8518cf80c2a7";
    sha256 = "0aki54sji46z63h8gl0qacyv89mndvf58s3b9hkjnnn4zgwig8vg";
  };

  tui = buildGoModule {
    pname = "opencode-tui";
    inherit (finalAttrs) version;
    src = finalAttrs.src;
    sourceRoot = "source/packages/tui";

    vendorHash = "sha256-qsOL6gsZwEm7YcYO/zoyJAnVmciCjPYqPavV77psybU=";

    subPackages = [ "cmd/opencode" ];

    env.CGO_ENABLED = 0;

    ldflags = [
      "-s"
      "-X=main.Version=${finalAttrs.version}"
    ];

    installPhase = ''
      runHook preInstall

      install -Dm755 $GOPATH/bin/opencode $out/bin/tui

      runHook postInstall
    '';
  };

  node_modules = stdenvNoCC.mkDerivation {
    pname = "opencode-node_modules";
    inherit (finalAttrs) version src;

    impureEnvVars = lib.fetchers.proxyImpureEnvVars ++ [
      "GIT_PROXY_COMMAND"
      "SOCKS_SERVER"
    ];

    nativeBuildInputs = [
      bun
      writableTmpDirAsHomeHook
    ];

    dontConfigure = true;

    buildPhase = ''
      runHook preBuild

      export BUN_INSTALL_CACHE_DIR=$(mktemp -d)

      # First install all dependencies to get the workspace set up correctly
      bun install \
          --force \
          --frozen-lockfile \
          --no-progress \
          --ignore-scripts

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out/node_modules
      cp -R ./node_modules $out

      runHook postInstall
    '';

    # Required else we get errors that our fixed-output derivation references store paths
    dontFixup = true;

    outputHash = opencode-node-modules-hash.${stdenvNoCC.hostPlatform.system};
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    bun
    models-dev
  ];

  patches = [
    # Patch `packages/opencode/src/provider/models-macro.ts` to get contents of
    # `api.json` from the file bundled with `bun build`.
    ./local-models-dev.patch
    # Fix tree-sitter parsing errors in bash tool
    ./fix-tree-sitter-bash.patch
  ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/node_modules .

    runHook postConfigure
  '';

  env.MODELS_DEV_API_JSON = "${models-dev}/dist/_api.json";

  buildPhase = ''
    runHook preBuild

    bun build \
      --define OPENCODE_VERSION="'${finalAttrs.version}'" \
      --compile \
      --minify \
      --target=${bun-target.${stdenvNoCC.hostPlatform.system}} \
      --outfile=opencode \
      ./packages/opencode/src/index.ts \
      ${finalAttrs.tui}/bin/tui

    runHook postBuild
  '';

  dontStrip = true;

  installPhase = ''
    runHook preInstall

    install -Dm755 opencode $out/bin/opencode

    runHook postInstall
  '';

  passthru = {
    tests.version = testers.testVersion {
      package = finalAttrs.finalPackage;
      command = "HOME=$(mktemp -d) opencode --version";
      inherit (finalAttrs) version;
    };
    updateScript = nix-update-script {
      extraArgs = [
        "--subpackage"
        "tui"
        "--subpackage"
        "node_modules"
        "--subpackage"
        "models-dev-data"
      ];
    };
  };

  meta = {
    description = "AI coding agent built for the terminal";
    longDescription = ''
      OpenCode is a terminal-based agent that can build anything.
      It combines a TypeScript/JavaScript core with a Go-based TUI
      to provide an interactive AI coding experience.
    '';
    homepage = "https://github.com/sst/opencode";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
    maintainers = with lib.maintainers; [
      zestsystem
      delafthi
    ];
    mainProgram = "opencode";
  };
})
