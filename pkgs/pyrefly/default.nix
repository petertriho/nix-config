{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-26";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "c4308da6b4bc4689c1f23be84573b1dd1d5b26cb";
    sha256 = "11pi0wgg9018c3yrymjj880l9qicnx5iraqnhxizzxy9d3pfbjxm";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-wNEgP7VMnk7/SltU302gNW/7xF8OfkZR0GXe9VFTt/g=";

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
