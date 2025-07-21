{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-20";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "56803999dc470fa74634ec04fc452b8eadedc0eb";
    sha256 = "0ars8jzv30fadfqh7qc7fvhwvhvihyg57yngs4nv8hm8slx79ya0";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-TCG3ruyHLjhIhlS5kGTIMqeGkD1Su6vmlCQhuaRBkKk=";

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
