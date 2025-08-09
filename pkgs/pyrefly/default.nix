{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-08";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "ce4dd4504c3c6942d1cedcbeb5493fc620fe205e";
    sha256 = "151g2mdshdy7m3wbfhb6m9bf3cwrcdmlg5y7lf255lwsxg55zjf0";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-eGnvVsrGNolmW7VRc8TxWz9DxmNhRweGIyIj5yFhuE8=";

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
