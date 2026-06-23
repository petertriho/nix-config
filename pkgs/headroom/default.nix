{
  lib,
  stdenv,
  pkgs,
  fetchFromGitHub,
  pyproject-nix,
  uv2nix,
  pyproject-build-systems,
}:
let
  src = fetchFromGitHub {
    owner = "chopratejas";
    repo = "headroom";
    rev = "da1a3973ed79d89617087ec315e77fb82356c03b";
    hash = "sha256-7Ig+8ObShbM+gD/DedJll1Y5YsEyh7ikpnCCZqVNkDY=";
  };

  workspace = uv2nix.lib.workspace.loadWorkspace {
    workspaceRoot = src;
  };

  overlay = workspace.mkPyprojectOverlay {
    sourcePreference = "wheel";
  };

  buildOverrides = final: prev: {
    headroom-ai = prev.headroom-ai.overrideAttrs (old: {
      postPatch = (old.postPatch or "") + ''
        substituteInPlace crates/headroom-core/Cargo.toml \
          --replace-fail '"ort-download-binaries-rustls-tls",' '"ort-load-dynamic",'
      '';

      cargoDeps = pkgs.rustPlatform.importCargoLock {
        lockFile = "${src}/Cargo.lock";
      };

      nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [
        pkgs.cargo
        pkgs.rustc
        pkgs.rustPlatform.cargoSetupHook
      ];
    });
  };

  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages {
      inherit (pkgs.python312Packages) python;
    }).overrideScope
      (
        lib.composeManyExtensions [
          pyproject-build-systems.overlays.default
          overlay
          buildOverrides
        ]
      );

  pythonEnv = pythonSet.mkVirtualEnv "headroom-env" {
    headroom-ai = [
      "mcp"
      "proxy"
      "code"
      "html"
    ];
  };
in
stdenv.mkDerivation {
  pname = "headroom";
  version = "0.27.0-unstable-2026-06-23";

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    ln -s ${pythonEnv}/bin/headroom $out/bin/headroom
    runHook postInstall
  '';

  passthru = {
    inherit pythonEnv src;
  };

  meta = {
    description = "Context optimization layer for LLM applications";
    homepage = "https://github.com/chopratejas/headroom";
    license = lib.licenses.asl20;
    mainProgram = "headroom";
    platforms = lib.platforms.unix;
  };
}
