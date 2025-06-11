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
  version = "0.19.0";
  pyproject = true;

  src = fetchPypi {
    inherit pname version;
    hash = "sha256-f95oWrJHs7OWTLSqTXpt2yaUkhz9UGDK3BCohbJMGWk=";
  };

  cargoDeps = rustPlatform.fetchCargoVendor {
    inherit src;
    hash = "sha256-QAwo5jyuYIRVNmUuXAQjBHFy66V7lOV1oFVabqzZ6cY=";
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
