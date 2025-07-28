{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-28";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "633d723dd84934c7591f982e549b221c563144e6";
    sha256 = "1v88f4w40hz08bcm8x5s9yyyz4r20b61ks80kyvxlw1r8m3nvjsr";
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
