{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-06-26";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "35997851fd3bed736c2c4eaadc1bcc9784dcdfd0";
    sha256 = "1h1mplx85v4jgzdfdyc4bmagyrnx5dmh2vanf9rrbgsw8lphlnkq";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-Pc/GBlKyic9/ywNn4/MkYvsGDWdCrgQ6MD5Q2tBMm7k=";

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
