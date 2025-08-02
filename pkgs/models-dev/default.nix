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
    "aarch64-darwin" = "sha256-099Y+7cLtSQ0s71vxUGEochQSpCv1hbkwYbWx/eOvhY=";
    "aarch64-linux" = "sha256-Enx27ag7D0Qeb/ss/7zTQ1XSukyPzOMMK7pTYHqQUMs=";
    "x86_64-darwin" = "sha256-099Y+7cLtSQ0s71vxUGEochQSpCv1hbkwYbWx/eOvhY=";
    "x86_64-linux" = "sha256-Enx27ag7D0Qeb/ss/7zTQ1XSukyPzOMMK7pTYHqQUMs=";
  };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "models-dev";
  version = "unstable-2025-08-01";
  src = fetchFromGitHub {
    owner = "sst";
    repo = "models.dev";
    rev = "aa91010df3f98326f0588379fa0395f2694affb1";
    sha256 = "1l41mxvgl2ci3b9c5nbylhvg67d514kq118vbz18f1bkpb58yvbh";
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
