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
    owner = "chunkhound";
    repo = "chunkhound";
    rev = "805b8347864f82152a6a6458c29643edb8b34f4b";
    hash = "sha256-LQxXSMddBYILf6PeoqzTWNnUDWiyXSTTtoEfEjYxpaY=";
  };

  workspace = uv2nix.lib.workspace.loadWorkspace {
    workspaceRoot = src;
  };

  overlay = workspace.mkPyprojectOverlay {
    sourcePreference = "wheel";
  };

  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages {
      inherit (pkgs.python312Packages) python;
    }).overrideScope
      (
        lib.composeManyExtensions [
          pyproject-build-systems.overlays.wheel
          overlay
        ]
      );

  pythonEnv = pythonSet.mkVirtualEnv "chunkhound-env" workspace.deps.default;
in
stdenv.mkDerivation {
  pname = "chunkhound";
  version = "4.1.0b1-unstable-2026-02-10";

  inherit src;

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    ln -s ${pythonEnv}/bin/chunkhound $out/bin/chunkhound
    runHook postInstall
  '';

  meta = {
    description = "Local-first codebase intelligence";
    homepage = "https://github.com/chunkhound/chunkhound";
    license = lib.licenses.mit;
    mainProgram = "chunkhound";
  };
}
