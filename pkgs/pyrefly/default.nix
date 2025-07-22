{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-22";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "32ee4f90ff41b63bf652c4b8be614b0476674bd4";
    sha256 = "0py2m242a1v73zg85x8dwwvawimdki3lhk5jbm7xiww8n0arngh9";
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
