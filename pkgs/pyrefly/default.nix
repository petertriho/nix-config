{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-01";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "5dbe7a905b4b0f8500ea62934625a27a0f196876";
    sha256 = "1vbym02h4i4z3b8s10dc3k5bhd8kfkssfgzm1gakarcgjxmj4lzm";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-SadZDZA0B99MGDYGppZvQtThKX3YLMe/lQ2eMLuYMhk=";

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
