{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-10";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "7763735570eea7b2106f20a10f12a22c0ccd5f5a";
    sha256 = "0wv7z78q14ra41hnwrj86vml1v8qmiva3cpcd01ij258mlp2hmlr";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-eGnvVsrGNolmW7VRc8TxWz9DxmNhRweGIyIj5yFhuE8=";

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
