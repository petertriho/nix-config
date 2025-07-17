# https://github.com/NixOS/nixpkgs/blob/master/pkgs/by-name/op/opencode/package.nix
{
  lib,
  stdenvNoCC,
  buildGoModule,
  bun,
  fetchFromGitHub,
  fetchurl,
  nix-update-script,
  testers,
  writableTmpDirAsHomeHook,
}:
let
  opencode-node-modules-hash = {
    "aarch64-darwin" = "sha256-i066XTY25whfPTulPUzt9whyLbLzGPvGU7H/d0f2EKE=";
    "aarch64-linux" = "sha256-VB7bikVFy8w82M6AkYXjsHx34CNHAGMgY69KISOokE4=";
    "x86_64-darwin" = "sha256-i066XTY25whfPTulPUzt9whyLbLzGPvGU7H/d0f2EKE=";
    "x86_64-linux" = "sha256-VB7bikVFy8w82M6AkYXjsHx34CNHAGMgY69KISOokE4=";
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
  version = "unstable-2025-07-17";
  src = fetchFromGitHub {
    owner = "sst";
    repo = "opencode";
    rev = "a493aec1749de627130618769497373592789d47";
    sha256 = "097i8bz6xjyjx0vl6w631kgzp7cw84kzb916v63xz85776zbcx5r";
  };

  tui = buildGoModule {
    pname = "opencode-tui";
    inherit (finalAttrs) version;
    src = "${finalAttrs.src}/packages/tui";

    vendorHash = "sha256-GeXDi/y9NoJJ9P5hQk0vtIxg/6pDDtMPdxgQvHZJzJ4=";

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

      bun install \
          --filter=opencode \
          --force \
          --frozen-lockfile \
          --no-progress

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

  models-dev-data = fetchurl {
    url = "https://models.dev/api.json";
    sha256 = "0vmd7mdxq7m2lw6kjfppn6z9mlm6v1d920358vd54dsxxbzg9yp9";
  };

  nativeBuildInputs = [ bun ];

  patches = [
    # Patch `packages/opencode/src/provider/models-macro.ts` to load the prefetched `models.dev/api.json`
    # from the `MODELS_JSON` environment variable instead of fetching it at build time.
    ./fix-models-macro.patch
  ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/node_modules .

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    export MODELS_JSON="$(cat ${finalAttrs.models-dev-data})"
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
