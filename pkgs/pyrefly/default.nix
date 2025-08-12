{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-11";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "3cf32eac7ce47413b095ed3b641339a6193bd250";
    sha256 = "1kbifbik5lrzn8vcj0rbzq9d3ac0s84k3bvq64gxmq8g2jxjkwra";
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
