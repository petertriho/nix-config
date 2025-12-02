# https://github.com/natsukium/mcp-servers-nix/blob/main/pkgs/official/context7/default.nix
{
  lib,
  stdenv,
  fetchFromGitHub,
  bun,
  makeWrapper,
  nodejs-slim,
  ...
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "context7-mcp";
  version = "@upstash/context7-mcp@1.0.31-unstable-2025-12-02";

  src = fetchFromGitHub {
    owner = "upstash";
    repo = "context7";
    rev = "24c592fb961a96b9455987ab7c5b9cc8730802ea";
    sha256 = "sha256-Sh1fgsiq1KwyZmO3aQrBq/4K39VLDTfcNr3AKNdBpS8=";
  };

  # Step 1: Fixed-output derivation for dependencies
  deps = stdenv.mkDerivation {
    pname = "context7-mcp-deps";
    inherit (finalAttrs) version src;

    nativeBuildInputs = [ bun ];

    dontBuild = true;
    dontFixup = true;

    # Build from the MCP package subdirectory
    sourceRoot = "source/packages/mcp";

    installPhase = ''
      export HOME=$TMPDIR

      # Install dependencies (bun can read pnpm-lock.yaml)
      bun install --frozen-lockfile --no-cache

      # Copy to output
      mkdir -p $out
      cp -r node_modules $out/
      cp package.json $out/
    '';

    # This hash represents the dependencies
    outputHash = "sha256-n2U4u73nE9na+JxGDazJhL+u7X09HSxesoZx7lAS/hM=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    bun
    makeWrapper
  ];

  # Build from the MCP package subdirectory
  sourceRoot = "source/packages/mcp";

  buildPhase = ''
    runHook preBuild

    export HOME=$TMPDIR

    cp -r ${finalAttrs.deps}/node_modules .

    substituteInPlace node_modules/.bin/tsc \
      --replace-fail "/usr/bin/env node" "${lib.getExe nodejs-slim}"

    # Run the build script directly (tsc && chmod 755 dist/index.js)
    ${lib.getExe bun} run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/context7-mcp

    cp -r dist $out/lib/context7-mcp/

    cp -r node_modules $out/lib/context7-mcp/
    cp package.json $out/lib/context7-mcp/

    chmod +x $out/lib/context7-mcp/dist/index.js

    mkdir -p $out/bin
    makeWrapper $out/lib/context7-mcp/dist/index.js $out/bin/context7-mcp \
      --prefix PATH : ${lib.makeBinPath [ nodejs-slim ]} \

    runHook postInstall
  '';

  meta = {
    description = "Up-to-date code documentation for LLMs and AI code editors";
    homepage = "https://context7.com";
    license = lib.licenses.mit;
    # maintainers = with lib.maintainers; [
    #   natsukium
    #   vaporif
    # ];
    mainProgram = "context7-mcp";
  };
})
