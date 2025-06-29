{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-06-28";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "c247d452349c10958a44a3842540b12f7634e220";
    sha256 = "1phnp2i89kgir4mi4ji2xqmwq2y59hn4kw267lr3yxcc2jimik11";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-uIarNrxLz+ila2AgA+WRIgGveBMrwp9Vb710PDCtaa4=";

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
