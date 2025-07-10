{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-10";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "1dcab8bbc1065d63e7f87668896b4006cd8035d1";
    sha256 = "0hhv9x9p3g5lsbynb35zfz1f8rlh4csf3xnci0gfzid6w9zx2zna";
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
