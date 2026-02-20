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

  pyprojectOverrides =
    final: prev:
    lib.optionalAttrs stdenv.isLinux {
      nvidia-cufile-cu12 = prev.nvidia-cufile-cu12.overrideAttrs (old: {
        autoPatchelfIgnoreMissingDeps = old.autoPatchelfIgnoreMissingDeps or [ ] ++ [
          "libmlx5.so.1"
          "librdmacm.so.1"
          "libibverbs.so.1"
        ];
      });
      nvidia-nvshmem-cu12 = prev.nvidia-nvshmem-cu12.overrideAttrs (old: {
        autoPatchelfIgnoreMissingDeps = old.autoPatchelfIgnoreMissingDeps or [ ] ++ [
          "libmlx5.so.1"
          "librdmacm.so.1"
          "libibverbs.so.1"
          "liboshmem.so.40"
          "libpmix.so.2"
          "libfabric.so.1"
          "libucs.so.0"
          "libucp.so.0"
          "libmpi.so.40"
        ];
      });
      nvidia-cusparse-cu12 = prev.nvidia-cusparse-cu12.overrideAttrs (old: {
        autoPatchelfIgnoreMissingDeps = old.autoPatchelfIgnoreMissingDeps or [ ] ++ [
          "libnvJitLink.so.12"
        ];
      });
      nvidia-cusolver-cu12 = prev.nvidia-cusolver-cu12.overrideAttrs (old: {
        autoPatchelfIgnoreMissingDeps = old.autoPatchelfIgnoreMissingDeps or [ ] ++ [
          "libnvJitLink.so.12"
          "libcublas.so.12"
          "libcublasLt.so.12"
          "libcusparse.so.12"
        ];
      });
      torchvision = prev.torchvision.overrideAttrs (old: {
        autoPatchelfIgnoreMissingDeps = old.autoPatchelfIgnoreMissingDeps or [ ] ++ [
          "libtorch.so"
          "libtorch_cpu.so"
          "libtorch_python.so"
          "libc10.so"
          "libc10_cuda.so"
          "libtorch_cuda.so"
          "libcudart.so.12"
        ];
      });
      torch = prev.torch.overrideAttrs (old: {
        autoPatchelfIgnoreMissingDeps = old.autoPatchelfIgnoreMissingDeps or [ ] ++ [
          "libcudart.so.12"
          "libcudnn.so.9"
          "libcusparseLt.so.0"
          "libcufile.so.0"
          "libcusolver.so.11"
          "libcublas.so.12"
          "libcusparse.so.12"
          "libnvrtc.so.12"
          "libcuda.so.1"
          "libcupti.so.12"
          "libcufft.so.11"
          "libnccl.so.2"
          "libcurand.so.10"
          "libcublasLt.so.12"
          "libnvshmem_host.so.3"
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
          overlay
          buildSystemOverrides
          pyprojectOverrides
        ]
      );

  pythonEnv = pythonSet.mkVirtualEnv "rivalsearchmcp-env" workspace.deps.default;
in
stdenv.mkDerivation {
  pname = "rivalsearchmcp";
  version = "0-unstable-2026-02-17";

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
