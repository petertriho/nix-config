{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-25";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "9b4a24f22454968933d394a638a922261de6509b";
    sha256 = "1k9s6xg60hyrzr8b70znzylxxg599lljkhajrpl7klxnp7np0877";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-YFFDh563o25vi/T95uKeT1UHfOljFKJRexidBgl02pE=";

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
