{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-06";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "97076d4f7b358fc1778ef5724f1585486dc55798";
    sha256 = "1nzapgbsrb9qi7r7wy36yk8ym9lxi5psibj8sgwl91cvrg8nl6gf";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-RxlFwiqpHbg/zMYg9kuDroxIck6I9xYOnwNCB6HBTT8=";

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
