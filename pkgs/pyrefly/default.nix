{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-02";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "dded1edd061ea970f11e7a3f8d6b8c28ac1833de";
    sha256 = "0rwmvigdzqsjvnag0ap6dqi2lkjchs849qbipmahfammd1z5qgbr";
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
