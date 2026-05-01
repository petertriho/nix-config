{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bun,
  nodejs,
  tailwindcss_4,
  writableTmpDirAsHomeHook,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "impeccable";
  version = "skill-v3.0.6-unstable-2026-04-30";

  src = fetchFromGitHub {
    owner = "pbakaus";
    repo = "impeccable";
    rev = "a312da5ec73b83b42b3a1f9e90fcdbccd4a6b539";
    hash = "sha256-AbkTQrjJxWF5JZZVsiCn+iZHW/cUjI7VpJvEMUELKps=";
  };

  node_modules = stdenvNoCC.mkDerivation {
    pname = "${finalAttrs.pname}-node_modules";
    inherit (finalAttrs) src version;

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
          --cpu="*" \
          --frozen-lockfile \
          --ignore-scripts \
          --no-cache \
          --no-progress \
          --production \
          --os="*"

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out/node_modules
      cp -R ./node_modules $out

      runHook postInstall
    '';

    dontFixup = true;

    outputHash = "sha256-6sOPpuWBa0iMrxUH8+x+keE9ciI5mpteEMFCdYJAtgc=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    bun
    nodejs
    writableTmpDirAsHomeHook
  ];

  postPatch = ''
    substituteInPlace scripts/build.js \
        --replace-fail 'bunx @tailwindcss/cli' '${lib.getExe tailwindcss_4}'
  '';

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/node_modules .
    patchShebangs node_modules

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    bun run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -d $out/share/impeccable
    cp -r dist $out/share/impeccable/

    runHook postInstall
  '';

  meta = {
    description = "Cross-provider design skills and commands for LLM-powered development tools";
    homepage = "https://github.com/pbakaus/impeccable";
    license = lib.licenses.asl20;
    maintainers = [ ];
    platforms = bun.meta.platforms;
  };
})
