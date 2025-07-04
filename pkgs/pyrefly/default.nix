{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-04";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "964cf6c7076bc9cb7a09f7a479ef5e2e6044ea32";
    sha256 = "0bayyqp99x0s0n6zpk9wh4yx3ikvpmpcls5qfy4drrs00w3ss5pr";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-MC1EIhXiOTo8PbLGh15cC6V806L0NQCt60cdJHGY+Hw=";

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
