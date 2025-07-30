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
    rev = "5e4e4d409b75cb76da60912be9f6f6418eabb7c1";
    sha256 = "1d0igdwvpd4i6hgv6i0ybw8v2ljalhdvmkwilrqbi7ax1n2iff95";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-r1tkE5tNUQft4NLzxyQwiSYFnjiSZJpzyawbHMeknQA=";

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
