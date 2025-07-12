{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-12";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "469feb64c558b34b03370d8706da6187f61fb0bf";
    sha256 = "1ld3ca3ja6xx4s61ymsz1hcvrb02zmwd3vzp1a5n084251iqscd3";
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
