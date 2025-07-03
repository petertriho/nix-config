{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-03";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "058c3a721593846c8eb665e697c007934428c4df";
    sha256 = "13nva9vvw5mlcsqni3kcr9526hkdfhc188mnrb0hp2xpswb92gq3";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-tBtZCX7HLIAmqBxBaHGzxR7Ro2pVk4VYJmElSQqDl+w=";

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
