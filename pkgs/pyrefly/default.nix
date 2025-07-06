{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-05";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "748d5aeb3f16f7c665965ecff5de2cffe17659f9";
    sha256 = "0d6yrmi8b4c7larndg9vln5wwgch01y6dgli4f66ib8v7wpiflrs";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-rFZZOEpKH8k3JFbyA8eKBixwuU1ehPyjFQ6kPHPqQKg=";

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
