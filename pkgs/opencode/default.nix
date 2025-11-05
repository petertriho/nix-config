{
  lib,
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
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "opencode";
  version = "unstable-2025-11-05";
  src = (
    finalAttrs.passthru.sources.${stdenvNoCC.hostPlatform.system}
      or (throw "Unsupported system: ${stdenvNoCC.hostPlatform.system}")
  );

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
    sources =
      let
        prepareOpencodeSource =
          outputHash:
          stdenvNoCC.mkDerivation {
            pname = "opencode-src-with-node_modules";
            inherit (finalAttrs) version;
            src = fetchFromGitHub {
              owner = "sst";
              repo = "opencode";
              rev = "7269c2316d1165b30fc8778e63320a9fc594176a";
              sha256 = "0aqqys6jj57ndaryqkb0wijpasggh81mbg4pvfn8ikp4hydx4y8m";
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

            inherit outputHash;
            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
          };
      in
      {
        x86_64-linux = prepareOpencodeSource "sha256-q+3/FgnxALMnUavY2rNUgot7S29U3QV8v3wmUQ6vla0=";
        aarch64-linux = prepareOpencodeSource "sha256-q+3/FgnxALMnUavY2rNUgot7S29U3QV8v3wmUQ6vla0=";
        x86_64-darwin = prepareOpencodeSource "sha256-df7yx5axqrb63Ecebsu0Ks7eVtHm1XfV7DZCqi0/Ff4=";
        aarch64-darwin = prepareOpencodeSource "sha256-df7yx5axqrb63Ecebsu0Ks7eVtHm1XfV7DZCqi0/Ff4=";
      };
    tests.version = testers.testVersion {
      package = finalAttrs.finalPackage;
      command = "HOME=$(mktemp -d) opencode --version";
      inherit (finalAttrs) version;
    };
  };

  meta = {
    description = "AI coding agent built for the terminal";
    changelog = "https://github.com/sst/opencode/releases/tag/v${finalAttrs.version}";
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
