{
  lib,
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
    rev = "52549c0300f820d664844397bb082beaaa964fff";
    hash = "sha256-LlFl+Gk3+WwOT/IT2VBIFSqqfGJzCLOJL42WmV9GBYI=";
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
in
# Create virtualenv with chunkhound installed
pythonSet.mkVirtualEnv "chunkhound" workspace.deps.default
