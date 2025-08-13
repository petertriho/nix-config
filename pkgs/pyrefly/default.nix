{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-13";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "712f2df5496de4f4f03faeb85b6845e9b4723994";
    sha256 = "0m7gd8976l9h4r4mb30ygab5330fnp99dsrg3a8zvgj8ri6z2cpv";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-aOret3lR8oEF1ViHvn2atkalY3n9YS6vN4TlX/7QtCc=";

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
