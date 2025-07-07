{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-06";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "d41ed12989caa2083fdf87667a50b346ddd00802";
    sha256 = "037d9jxi1y0p7by10zx89047g4vj12l293i2dzkdrzdl0ckndzzx";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-rFZZOEpKH8k3JFbyA8eKBixwuU1ehPyjFQ6kPHPqQKg=";

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
