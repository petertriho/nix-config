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
        x86_64-linux = "sha256-j+TEfYn1WygBJz1khRxwPxC2YwMFncZPiKrVnXwaXYw=";
        aarch64-linux = "sha256-j+TEfYn1WygBJz1khRxwPxC2YwMFncZPiKrVnXwaXYw=";
        x86_64-darwin = "sha256-8RAilfP63HFxn+0ELzynzvFqg3V8wKuOg4l45C3JX7Y=";
        aarch64-darwin = "sha256-8RAilfP63HFxn+0ELzynzvFqg3V8wKuOg4l45C3JX7Y=";
      }
      .${stdenv.hostPlatform.system};
  };

  finalAttrs = rec {
    pname = "ralph-tui";
    version = "0.8.0-unstable-2026-02-18";

    src = fetchFromGitHub {
      owner = "subsy";
      repo = "ralph-tui";
      rev = "07ea6fcef49ae3755107f49fb7202361c42eaf12";
      hash = "sha256-9yn5C5AJLGjN8U0gljbg9GRF3eFP8e1ktTDawNkCwig=";
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
