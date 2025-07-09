{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-08";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "5a5b6f4df5df1bdeece986b4695d91693ee2e5a0";
    sha256 = "0kg856lvvmdr4ww6qbfqcqxnlr61hyip3qa4bw4apajcsg4q5r2m";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-0pLP33nmoopU9PoMl7oBV+hSC3u2V9n4ctjgURn9WYU=";

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
