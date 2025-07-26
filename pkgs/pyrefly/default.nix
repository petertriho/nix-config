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
    rev = "ab33843a2c09e1f2ce589e4d96aee205168b2f39";
    sha256 = "17cchnbxm9q0b0xpsxq3ddrm34yscpz82y61z4b4gvmrwh6v8hra";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-YFFDh563o25vi/T95uKeT1UHfOljFKJRexidBgl02pE=";

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
