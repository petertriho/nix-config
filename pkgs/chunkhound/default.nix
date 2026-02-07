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
    rev = "992a0c0d12a0b7573f4defc94923b2b174d35c86";
    hash = "sha256-fULG8QfcGstWuelQaPGMvO/zmU9byjDzzBA56H/BgOA=";
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
  version = "4.1.0b1-unstable-2026-02-06";

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
