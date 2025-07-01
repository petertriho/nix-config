{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-06-30";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "d904b28ffbdb5c847061b4634beda79dc7d7dc39";
    sha256 = "1lpjrnb46xryd62vzmcd6iblzq0il1kql5gpi6x95s3x45zfs8q1";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-ql66BrQlsTopzfP92+Yosjx6cWmM/9Aikza1YfKlF7U=";

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
