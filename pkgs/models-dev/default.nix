{
  lib,
  stdenvNoCC,
  bun,
  fetchFromGitHub,
  nix-update-script,
  writableTmpDirAsHomeHook,
}:
let
  models-dev-node-modules-hash = {
    "aarch64-darwin" = "sha256-VkqxZF2LkNBoIkbQGz98O+y7LgLqQ+FofV2WyMOOUEs=";
    "aarch64-linux" = "sha256-hMiCOMskK9kwGKaixsvodUVsOuuageiUAwxp/AvzR44=";
    "x86_64-darwin" = "sha256-VkqxZF2LkNBoIkbQGz98O+y7LgLqQ+FofV2WyMOOUEs=";
    "x86_64-linux" = "sha256-hMiCOMskK9kwGKaixsvodUVsOuuageiUAwxp/AvzR44=";
  };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "models-dev";
  version = "unstable-2025-08-05";
  src = fetchFromGitHub {
    owner = "sst";
    repo = "models.dev";
    rev = "8cdcfe09c0cf1ae22808b55b9279b0ae2928ece7";
    sha256 = "0xn4afg9xdiy6lnc43ckx86lhjjncbdrvin1hp80gcjj5fm5zw8d";
  };

  node_modules = stdenvNoCC.mkDerivation {
    pname = "models-dev-node_modules";
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

    outputHash = models-dev-node-modules-hash.${stdenvNoCC.hostPlatform.system};
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [ bun ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/node_modules .

    runHook postConfigure
  '';

  preBuild = ''
    patchShebangs packages/web/script/build.ts
  '';

  buildPhase = ''
    runHook preBuild

    cd packages/web
    bun run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/dist
    cp -R ./dist $out

    runHook postInstall
  '';

  passthru.updateScript = nix-update-script {
    extraArgs = [ "--version=branch" ];
  };

  meta = {
    description = "Comprehensive open-source database of AI model specifications, pricing, and capabilities";
    homepage = "https://github.com/sst/models-dev";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
    maintainers = with lib.maintainers; [ delafthi ];
  };
})
