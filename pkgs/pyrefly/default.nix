{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-07";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "502a717459bb38dbecca750d7d71a427ae81dadb";
    sha256 = "0fzpyriyy6j1g5ll54ipdl6ssdf6hi28fkk4giw47dzcynkyz7vi";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-ThvkfIBdqze/Sf6qsGrmAg1ovOirHY8ddS5g6yLSe5I=";

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
