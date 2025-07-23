{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-23";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "e6da7b6e749432c53f1c9f1391864f585148715b";
    sha256 = "0znq0v3mcc9g9gb6s8dk97dipr8q0212kkis55bldq0z72bsqbg9";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-pvHmdpSgKp4IPoD9budZlc940zFGmVEIsm9Mu9xL3NU=";

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
