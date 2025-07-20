{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-19";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "39f91f3d1822878c53cad0e6c5637ff31e5864d5";
    sha256 = "1k1yyfnxi4lzqgz9y926bvfyjs6c4c22pz8rvf5ph48fmacffbxz";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-d+/wqOf+e3+sF57G2xQdzn0hEg/7uy93NA2afxXn+h8=";

  # nativeInstallCheckInputs = [ versionCheckHook ];
  # doInstallCheck = true;
  doCheck = false;

  # requires unstable rust features
  env.RUSTC_BOOTSTRAP = 1;

  passthru.updateScript = nix-update-script { };

  meta = {
    description = "Fast type checker and IDE for Python";
    homepage = "https://github.com/facebook/pyrefly";
    license = lib.licenses.mit;
    mainProgram = "pyrefly";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    maintainers = with lib.maintainers; [
      cybardev
      QuiNzX
    ];
  };
})
