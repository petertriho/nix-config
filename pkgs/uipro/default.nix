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
  version = "2.9.0-unstable-2026-06-28";

  src = fetchFromGitHub {
    owner = "nextlevelbuilder";
    repo = "ui-ux-pro-max-skill";
    rev = "8a81ed60272d21d4b8808f7308d49a0b1b000555";
    hash = "sha256-oGVQiFuoWyvwG8tMAkZN6Af944s5ZrUYNh3NKCzXN9Q=";
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
