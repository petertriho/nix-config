{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-01";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "3a7457df06bf96c1d481c2bae2eeee2eef8fead7";
    sha256 = "1wg6wajdkjs3rww56ixq12ikcazbc6r71b96sg8pxwzwyq3awm41";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-dgegBupZpWGQMYhPUdArKvVIXUArNJp0XdPJUzb4mrU=";

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
