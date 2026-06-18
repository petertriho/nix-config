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
    rev = "8894ee0c18e6dfe858cf0034ec424fd0768a1334";
    hash = "sha256-R81bT1YlQtqD2ngRsUu4sZeos1k4OHEOPnl0Bwu/ejU=";
  };

  workspace = uv2nix.lib.workspace.loadWorkspace {
    workspaceRoot = src;
  };

  overlay = workspace.mkPyprojectOverlay {
    sourcePreference = "wheel";
  };

  buildOverrides = final: prev: {
    headroom-ai = prev.headroom-ai.overrideAttrs (old: {
      patches = (old.patches or [ ]) ++ [
        ./patches/0001-register-tool-result-interceptors-in-proxy.patch
        ./patches/0002-support-block-list-tool-results.patch
        ./patches/0003-route-obvious-code-and-html.patch
      ];

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
  version = "0.26.0-unstable-2026-06-18";

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
