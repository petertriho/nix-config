{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-25";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "07e16ac4f9379787b6a0e9258b804ae4352553e5";
    sha256 = "0q9nwmqc6j1kw8cwq955nj3qaqywxba38kjv5nki08lbmb0k15dz";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-J+zHQJ+jtPvvS6d8RloeuuOjra5JIhXPqeHPAj+/Rcw=";

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
