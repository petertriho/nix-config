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
  version = "1.0.21-unstable-2025-10-15";

  src = fetchFromGitHub {
    owner = "upstash";
    repo = "context7";
    rev = "661a7c96606380f4581274c775504445daadd35e";
    sha256 = "sha256-481RvtQclDdP8Qf5dFjJgwZGk/wAJy9fnfu+IXQHDhc=";
  };

  nativeBuildInputs = [
    bun
    makeWrapper
  ];

  deps = stdenv.mkDerivation {
    pname = "context7-mcp-deps";
    inherit (finalAttrs) version src;

    nativeBuildInputs = [ bun ];

    dontBuild = true;
    dontFixup = true;

    installPhase = ''
      export HOME=$TMPDIR

      # Install dependencies
      bun install --frozen-lockfile --no-cache

      # Copy to output
      mkdir -p $out
      cp -r node_modules $out/
      cp bun.lock package.json $out/
    '';

    # This hash represents the dependencies
    outputHash = "sha256-Y4BFtnnN2gUM42G7QOQowATo6bV+CXtqfrzLjvNHofs=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  buildPhase = ''
    runHook preBuild

    export HOME=$TMPDIR

    cp -r ${finalAttrs.deps}/node_modules .
    cp ${finalAttrs.deps}/bun.lock .

    substituteInPlace node_modules/.bin/tsc \
      --replace-fail "/usr/bin/env node" "${lib.getExe nodejs-slim}"

    bun run build

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
