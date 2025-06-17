{
  lib,
  python3,
  fetchPypi,
  versionCheckHook,
  nix-update-script,
  rustPlatform,
  maturin,
}:
python3.pkgs.buildPythonApplication rec {
  pname = "pyrefly";
  version = "0.20.1";
  pyproject = true;

  src = fetchPypi {
    inherit pname version;
    hash = "sha256-o3zNKHL21nllufWhUiFEKgAJPhrGwOki6f2GBnkePEQ=";
  };

  cargoDeps = rustPlatform.fetchCargoVendor {
    inherit src;
    hash = "sha256-CeNIkdYNMAZF4bywJBEtcMi0SZj12I3pnNoKmu7W4ck=";
  };

  build-system = [ maturin ];

  nativeBuildInputs = with rustPlatform; [
    cargoSetupHook
    maturinBuildHook
  ];

  nativeCheckInputs = [ versionCheckHook ];

  env.RUSTC_BOOTSTRAP = 1;

  passthru.updateScript = nix-update-script { };

  meta = {
    description = "Fast type checker and IDE for Python";
    homepage = "https://github.com/facebook/pyrefly";
    license = lib.licenses.mit;
    mainProgram = "pyrefly";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
