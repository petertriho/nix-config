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
    rev = "cbf0fd647478cab98d4ac8ed072d40da0eff2f53";
    sha256 = "0q9nv2664rq8n5nyvf9z5vlxihfg9qwl0sbwr0sbc7nrxf0krxdv";
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
