{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-05";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "a206d0075d1be9977e883d0158065bb0c8186b4c";
    sha256 = "15hjry30fzpnxpf0487d31s124q45rl2azjyask2cbsvjkasqaa4";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-vsGnKEAV5aLRLBYorNIgsNDjXc1bOmCGC+z9mHjg0Og=";

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
