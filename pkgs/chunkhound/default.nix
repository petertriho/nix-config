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
    rev = "b68b613adab0ca113e0919e68d5d1bb470c2ad04";
    hash = "sha256-04++uJvxL7/1OWJ+UQ2lPOBGHl8QkByklP/3hg+0ZIY=";
  };

  workspace = uv2nix.lib.workspace.loadWorkspace {
    workspaceRoot = src;
  };

  overlay = workspace.mkPyprojectOverlay {
    sourcePreference = "wheel";
  };

  cythonOverlay = final: prev: {
    cython = prev.cython.overrideAttrs (old: rec {
      version = "0.29.37";
      src = pkgs.fetchPypi {
        pname = "Cython";
        inherit version;
        hash = "sha256-+BPUpt2Ure5dT/JmGR0dlb9tQWSk+sxTVCLAIbJQTPs=";
      };
    });
  };

  buildSystemOverrides =
    final: prev:
    lib.optionalAttrs stdenv.isLinux {
      hdbscan = prev.hdbscan.overrideAttrs (old: {
        postPatch = ''
          substituteInPlace pyproject.toml --replace 'cython<4' 'cython>=0.29,<3'
          substituteInPlace setup.py --replace \
              'raise ImportError' '# raise ImportError'
        '';
        dontUseBuildIsolation = true;
        env.UV_NO_BUILD_ISOLATION = "1";
        nativeBuildInputs =
          old.nativeBuildInputs or [ ]
          ++ final.resolveBuildSystem {
            setuptools = [ ];
            cython = [ ];
            numpy = [ ];
          };
        buildInputs = old.buildInputs or [ ] ++ [
          final.cython
          final.numpy
        ];
      });
    };

  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages {
      inherit (pkgs.python312Packages) python;
    }).overrideScope
      (
        lib.composeManyExtensions [
          pyproject-build-systems.overlays.wheel
          cythonOverlay
          overlay
          buildSystemOverrides
        ]
      );

  pythonEnv = pythonSet.mkVirtualEnv "chunkhound-env" workspace.deps.default;
in
stdenv.mkDerivation {
  pname = "chunkhound";
  version = "4.1.0b1-unstable-2026-02-28";

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
