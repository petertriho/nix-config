{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-30";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "2520a378364ee56a58919b3cf0264a46ba96a90e";
    sha256 = "1m2jpqnj4zxycpn43q2jig5h01ww6xps0ncyf8y2ar73yn0yq2lr";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-LZ540mY1Ta4VFYeOf1kEEAE9W6c0pnt9d/13TtDXjzU=";

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
