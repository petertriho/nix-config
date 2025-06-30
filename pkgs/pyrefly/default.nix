{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-06-29";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "4530e4561096cd54a2d12d5af4426a189d4d3a81";
    sha256 = "0ygwhvx3c7lk90636zl66x7nfl1q3cj6gsv55flgz0pnb0677p22";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-uIarNrxLz+ila2AgA+WRIgGveBMrwp9Vb710PDCtaa4=";

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
