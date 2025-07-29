{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-29";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "68ab83d941e6ea5a637ca434af5ba990bf0ebf49";
    sha256 = "1jb5drx2m94v4zygdnzkkln6q3fanxrlw71rf3ycxqckksgca0zy";
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
