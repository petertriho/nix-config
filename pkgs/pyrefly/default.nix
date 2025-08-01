{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-01";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "f13da36c179e7320f7cf56dc92f0277b60c86b10";
    sha256 = "1avy9x5lgwla11iig6vi3awg2wg600ckpyizx6n1rlg38dsh6pmk";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-SadZDZA0B99MGDYGppZvQtThKX3YLMe/lQ2eMLuYMhk=";

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
