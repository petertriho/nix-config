{
  lib,
  python3Packages,
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
in
with python3Packages;
let
  # Build python package set with uv2nix overlay
  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages {
      inherit python;
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
