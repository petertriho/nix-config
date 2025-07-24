{
  lib,
  rustPlatform,
  fetchFromGitHub,
  versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "pyrefly";
  version = "unstable-2025-07-23";

  src = fetchFromGitHub {
    owner = "facebook";
    repo = "pyrefly";
    rev = "bdf10ffd2a93d30522b77d77147389407c9698ed";
    sha256 = "11m78pp6w8ndg1n3gzpg99sir05jcn29lsi1yhh58hc9xdwdndsr";
  };

  buildAndTestSubdir = "pyrefly";
  cargoHash = "sha256-6zRjLs+NP0kxhS0Zkph70AszXuxsq60xV26OHdd8WtU=";

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
