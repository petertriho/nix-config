{
  lib,
  stdenv,
  fetchFromGitHub,
  bun,
  makeWrapper,
}:
let
  deps = stdenv.mkDerivation {
    pname = "ralph-tui-deps";
    inherit (finalAttrs) version src;

    nativeBuildInputs = [ bun ];

    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      bun install --frozen-lockfile --no-progress
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out

      # Remove bun cache symlinks before copying
      rm -rf node_modules/.cache

      cp -r node_modules $out/
      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash =
      {
        x86_64-linux = "sha256-5WbPYYwqdKfEq/Ye9q5WQFilOSX8FQxSv0rnIvKApcQ=";
        aarch64-linux = "sha256-5WbPYYwqdKfEq/Ye9q5WQFilOSX8FQxSv0rnIvKApcQ=";
        x86_64-darwin = "sha256-8tih1wTNCMBzi4bIv0T30vm62iM6KkqeE56YEs8ouew=";
        aarch64-darwin = "sha256-8tih1wTNCMBzi4bIv0T30vm62iM6KkqeE56YEs8ouew=";
      }
      .${stdenv.hostPlatform.system};
  };

  finalAttrs = rec {
    pname = "ralph-tui";
    version = "0.1.3-unstable-2026-01-14";

    src = fetchFromGitHub {
      owner = "subsy";
      repo = "ralph-tui";
      rev = "f4d350228fa7fd8bed122a5e773c7503f2843dc5";
      hash = "sha256-0nlfHKpCWzzp3JzykprxS040QgZPJERjePtPozftH4I=";
    };

    nativeBuildInputs = [
      bun
      makeWrapper
    ];

    buildPhase = ''
      runHook preBuild

      # Copy pre-fetched dependencies
      cp -r ${deps}/node_modules .
      chmod -R +w node_modules

      # Build the project
      bun build ./src/cli.tsx --outdir ./dist --target bun --sourcemap=external
      bun build ./src/index.ts --outdir ./dist --target bun --sourcemap=external

      # Copy assets
      cp -r assets dist/

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      # Install the built files
      mkdir -p $out/lib/ralph-tui
      cp -r dist/* $out/lib/ralph-tui/
      cp -r node_modules $out/lib/ralph-tui/

      # Create wrapper script
      mkdir -p $out/bin
      makeWrapper ${bun}/bin/bun $out/bin/ralph-tui \
          --add-flags "$out/lib/ralph-tui/cli.js"

      runHook postInstall
    '';

    meta = {
      description = "AI Agent Loop Orchestrator - Terminal UI for orchestrating AI coding agents";
      homepage = "https://github.com/subsy/ralph-tui";
      license = lib.licenses.mit;
      mainProgram = "ralph-tui";
    };
  };
in
stdenv.mkDerivation finalAttrs
