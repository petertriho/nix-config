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
    rev = "ba5fcec734b78e1cebfc01051cb1d90caddf20c5";
    sha256 = "076sjaf6ksl37yyhw78s64p0qzyf249l5iar952xr9c1gqh1zfk3";
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
