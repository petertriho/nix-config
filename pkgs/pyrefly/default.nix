{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-05";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "f86f5f4010e2e78b931bf395ace4c17fa25734fb";
    sha256 = "17ssn9i0nrvghpnbgc7wzhwp3vnikwvgq311rsg0d7hz9fssd4wh";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-vsGnKEAV5aLRLBYorNIgsNDjXc1bOmCGC+z9mHjg0Og=";

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
