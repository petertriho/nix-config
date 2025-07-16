{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-15";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "b9d927ff66212cbcd1ecb6aa66bba953ad6fdc94";
    sha256 = "105c4br95r8y1i3i3ljjj9kbnwc6p9jvjkhds1wh2d91yw2ykxmi";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-fMEJh/90fLp03gRvZwvy1POjQkrR0tneKfBgc5OMLxI=";

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
