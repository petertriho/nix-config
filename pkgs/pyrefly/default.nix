{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-18";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "6811389a6562e4d0ed94f7fbfbfd8967caa27334";
    sha256 = "1ln5a3x4ai55jr8bfpf1m0hhmsbzfsg45czmkv2ndmsxhmnjfrqd";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-hD2Mxw1WySHvKZ3eD7xeDFO5XJ1KL5ttJBjleqAxKiE=";

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
