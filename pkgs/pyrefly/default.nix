{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-13";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "06f6bc2351afaac6a651a12f6f3a3f252aa8974b";
    sha256 = "1fjrvy6n6b093xcwk5fzl6scfx1rbgmxc0rzdn6d6pqsi5dxmqax";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-0PBIs80+AhBNRIQftUqeh1ejoJBcMLXdrNurtghmV+c=";

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
