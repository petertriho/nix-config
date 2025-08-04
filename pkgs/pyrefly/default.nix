{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-08-04";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "22faea87394c017786fea8769e291d9de614675b";
    sha256 = "0icwqic4jppnrq2ci4j7zf21xf3910hskmcacsnfh264a9nhnm5n";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-SadZDZA0B99MGDYGppZvQtThKX3YLMe/lQ2eMLuYMhk=";

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
