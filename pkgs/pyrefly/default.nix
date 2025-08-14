{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-14";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "30bb2442ac160e555935c07ec26c17759aca1537";
    sha256 = "0vc20f961nhc6ajcxys55vadqqsa8nk6xvjmh5462iw6n6vzgwwk";
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
