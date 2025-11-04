{
  lib,
  stdenv,
  stdenvNoCC,
  bun,
  cacert,
  fetchFromGitHub,
  fzf,
  makeBinaryWrapper,
  models-dev,
  nix-update-script,
  nodejs,
  ripgrep,
  testers,
  writableTmpDirAsHomeHook,
}:
let
  src-with-node_modules = stdenvNoCC.mkDerivation (finalAttrs: {
    pname = "opencode-src-with-node_modules";
    version = "unstable-2025-11-04";
    src = fetchFromGitHub {
      owner = "sst";
      repo = "opencode";
      rev = "d341d26e37fd458bffc6b51c7fe5a4d33eaa182f";
      sha256 = "0vkfij2v0wl3433izsl7pin92674msh4vvh46kmwniig5214qi4f";
    };
    impureEnvVars = lib.fetchers.proxyImpureEnvVars ++ [
      "GIT_PROXY_COMMAND"
      "SOCKS_SERVER"
    ];

    nativeBuildInputs = [
      bun
      nodejs
      writableTmpDirAsHomeHook
    ];

    patches = [
      # NOTE: Adds --npm-pack-only and --no-npm-pack flags to separate dependency fetching from compilation
      ./build-script.patch
    ];

    dontConfigure = true;

    buildPhase = ''
      runHook preBuild

      export BUN_INSTALL_CACHE_DIR=$(mktemp -d)
      export SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt
      export NODE_EXTRA_CA_CERTS=${cacert}/etc/ssl/certs/ca-bundle.crt

      # NOTE: Disabling post-install scripts with `--ignore-scripts` to avoid
      # shebang issues
      bun install \
        --filter=opencode \
        --force \
        --frozen-lockfile \
        --ignore-scripts \
        --no-progress

      pushd packages/opencode
        OPENCODE_CHANNEL=latest  OPENCODE_VERSION=${finalAttrs.version}  bun run ./script/build.ts --single --npm-pack-only
      popd

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      cp -R . $out

      runHook postInstall
    '';

    # NOTE: Required else we get errors that our fixed-output derivation references store paths
    dontFixup = true;

    outputHash =
      {
        x86_64-linux = "sha256-9gaIBQ1F25L/cwuEsHPUDb3YYxDnWECLEgXipbI6i6A=";
        aarch64-linux = "sha256-XDsCHlAhduxT/m/HZbZKqgy73QiC2fORyJWRokTTFw4=";
        x86_64-darwin = "sha256-QkhfoNCX6hg/9RD4OPiWcWjEx4zrT+2Ljx797HlPpwU=";
        aarch64-darwin = "sha256-VpSncsyeBWTPYjpb7Vp+Kct5i45JtCSVYBhEgS/24vA=";
      }
      .${stdenv.hostPlatform.system};
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  });
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "opencode";
  inherit (src-with-node_modules) version;
  src = src-with-node_modules;

  nativeBuildInputs = [
    bun
    makeBinaryWrapper
  ];

  patches = [
    # NOTE: Patch `packages/opencode/src/provider/models-macro.ts` to get contents of
    # `_api.json` from the file bundled with `bun build`.
    ./local-models-dev.patch
  ];

  dontConfigure = true;

  buildPhase = ''
    runHook preBuild

    export MODELS_DEV_API_JSON=${models-dev}/dist/_api.json
    cd packages/opencode
    OPENCODE_CHANNEL=latest  OPENCODE_VERSION=${finalAttrs.version}  bun run ./script/build.ts --single --no-npm-pack

    runHook postBuild
  '';

  dontStrip = true;

  installPhase = ''
    runHook preInstall

    install -Dm755 opencode $out/bin/opencode

    runHook postInstall
  '';

  postInstall = ''
    wrapProgram $out/bin/opencode \
      --prefix PATH : ${
      lib.makeBinPath [
        fzf
        ripgrep
      ]
    }
  '';

  passthru = {
    tests.version = testers.testVersion {
      package = finalAttrs.finalPackage;
      command = "HOME=$(mktemp -d) opencode --version";
      inherit (finalAttrs) version;
    };
  };

  meta = {
    description = "AI coding agent built for the terminal";
    changelog = "https://github.com/sst/opencode/releases/tag/${finalAttrs.src.tag}";
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
