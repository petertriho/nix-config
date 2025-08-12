{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-12";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "cb370e249d871632501e19fa2a5bda5d75196f33";
    sha256 = "04vijk6ns32a3r80zm8wnqmpa97s7lkrvr0fspzjq5kmbh690zf8";
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
