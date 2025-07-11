{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-11";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "229822095d4d45f4f536aa383aa9728e6cc564e5";
    sha256 = "194g2fzdj25cgxzgb57zi9d48p0kj281i8bfdnmf6wsd9ky3c77h";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-ZSxGro2NxF5WJ9GgfEj7GJ0A4O5xNEvIxmJPz1wfeWk=";

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
