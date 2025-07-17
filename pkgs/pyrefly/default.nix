{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-16";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "2e28d5c4897f97f82c35ba830831ef7698bd18c7";
    sha256 = "0g8iv817qqq4j5xqsin0h2xwm33pn0gn7c4bnj7j55q54065p0x2";
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
