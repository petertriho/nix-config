{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-06-26";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "d186028ed276f33dfd3c713d67bf8c52da3d39b7";
    sha256 = "0a8qx7c76cfa6877f27ja1z356rn15fh67mrakgmks93l0q7iq7k";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-OQoUUAFS5c3YX27gmWeiHRIwaFpsXI8ibz3LO2cnOys=";

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
