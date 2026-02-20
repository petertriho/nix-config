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
    owner = "damionrashford";
    repo = "RivalSearchMCP";
    rev = "7f277a30e635b143d06fcdbe672fb0718b8673e2";
    hash = "sha256-TVu3+xeTzTmxhXu1pEdbLBe/FWbLEnRuLDiZ4zYTMqQ=";
  };

  workspace = uv2nix.lib.workspace.loadWorkspace {
    workspaceRoot = src;
  };

  overlay = workspace.mkPyprojectOverlay {
    sourcePreference = "wheel";
  };

  buildSystemOverrides = final: prev: {
    sgmllib3k = prev.sgmllib3k.overrideAttrs (old: {
      nativeBuildInputs =
        old.nativeBuildInputs or [ ]
        ++ final.resolveBuildSystem {
          setuptools = [ ];
        };
    });
  };

  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages {
      inherit (pkgs.python312Packages) python;
    }).overrideScope
      (
        lib.composeManyExtensions [
          pyproject-build-systems.overlays.wheel
          overlay
          buildSystemOverrides
        ]
      );

  pythonEnv = pythonSet.mkVirtualEnv "rivalsearchmcp-env" workspace.deps.default;
in
stdenv.mkDerivation {
  pname = "rivalsearchmcp";
  version = "unstable-2026-02-20";

  inherit src;

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    cat > $out/bin/rivalsearchmcp <<EOF
    #!${pkgs.runtimeShell}
    exec ${pythonEnv}/bin/python ${src}/server.py "\$@"
    EOF
    chmod +x $out/bin/rivalsearchmcp
    runHook postInstall
  '';

  meta = {
    description = "Web research MCP server";
    homepage = "https://github.com/damionrashford/RivalSearchMCP";
    license = lib.licenses.mit;
    mainProgram = "rivalsearchmcp";
  };
}
