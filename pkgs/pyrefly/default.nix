{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-08";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "d050dda071154b88a7f9f9b70e8374d1ca7260e0";
    sha256 = "198mdliksfzjpdg8kxbip8mn3i2xc7amm4bhgs48zvvp8nmzngrk";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-e2LCAYXgmrFbSrf5Gzgj1Pwhw44KqzNs7vpKxdTIj2k=";

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
