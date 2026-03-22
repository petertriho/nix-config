{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bun,
  nodejs,
  writableTmpDirAsHomeHook,
  makeWrapper,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "uipro-cli";
  version = "2.5.0-unstable-2026-03-10";

  src = fetchFromGitHub {
    owner = "nextlevelbuilder";
    repo = "ui-ux-pro-max-skill";
    rev = "07f4ef3ac2568c25a3b0c8ef5165a86abc3e56e4";
    hash = "sha256-zrWVV48rhz+4Hm4Ho1371yymkwbbtSveXLUvq55EGB4=";
  };

  sourceRoot = "${finalAttrs.src.name}/cli";

  node_modules = stdenvNoCC.mkDerivation {
    pname = "${finalAttrs.pname}-node_modules";
    inherit (finalAttrs) src version;
    sourceRoot = "${finalAttrs.src.name}/cli";

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
    outputHash = "sha256-C32er9XYfnYrfjLgIaq/vdfpYA2QDRi22YlrQzzqhpQ=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    bun
    nodejs
    writableTmpDirAsHomeHook
    makeWrapper
  ];

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

    mkdir -p $out/lib/node_modules/uipro-cli
    cp -r dist assets package.json $out/lib/node_modules/uipro-cli/

    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/uipro \
      --add-flags "$out/lib/node_modules/uipro-cli/dist/index.js"

    runHook postInstall
  '';

  meta = with lib; {
    description = "CLI to install UI/UX Pro Max skill for AI coding assistants";
    homepage = "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill";
    license = licenses.mit;
    mainProgram = "uipro";
    maintainers = [ ];
    platforms = bun.meta.platforms;
  };
})
