{
  lib,
  stdenv,
  rustPlatform,
  fetchFromGitHub,
  # nativeBuildInputs
  installShellFiles,
  buildPackages,
  # versionCheckHook,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "ty";
  version = "unstable-2025-08-14";

  src = fetchFromGitHub {
    owner = "astral-sh";
    repo = "ty";
    rev = "07868315cbe93ca2ed05ab3e8260bc39d8b26b02";
    fetchSubmodules = true;
    sha256 = "1r04k65fvs2b75sc6iwdwd06kjbnjdhxvkq81ipy89y0qlnq3k6q";
  };

  # For Darwin platforms, remove the integration test for file notifications,
  # as these tests fail in its sandboxes.
  postPatch = lib.optionalString stdenv.hostPlatform.isDarwin ''
    rm ${finalAttrs.cargoRoot}/crates/ty/tests/file_watching.rs
  '';

  cargoRoot = "ruff";
  buildAndTestSubdir = finalAttrs.cargoRoot;

  cargoBuildFlags = [ "--package=ty" ];

  cargoHash = "sha256-IVR33Bgnv4YGElqV5ccJ2961XbLSBMEEQdtJAUhc9Ew=";

  nativeBuildInputs = [ installShellFiles ];

  # `ty`'s tests use `insta-cmd`, which depends on the structure of the `target/` directory,
  # and also fails to find the environment variable `$CARGO_BIN_EXE_ty`, which leads to tests failing.
  # Instead, we specify the path ourselves and forgo the lookup.
  # As the patches occur solely in test code, they have no effect on the packaged `ty` binary itself.
  #
  # `stdenv.hostPlatform.rust.cargoShortTarget` is taken from `cargoSetupHook`'s `installPhase`,
  # which constructs a path as below to reference the built binary.
  preCheck = ''
    export CARGO_BIN_EXE_ty="$PWD"/target/${stdenv.hostPlatform.rust.cargoShortTarget}/release/ty
  '';

  cargoTestFlags = [
    "--package=ty" # CLI tests; file-watching tests only on Linux platforms
    "--package=ty_python_semantic" # core type checking tests
    "--package=ty_test" # test framework tests
  ];

  # nativeInstallCheckInputs = [ versionCheckHook ];
  # versionCheckProgramArg = "--version";
  doInstallCheck = true;

  postInstall = lib.optionalString (stdenv.hostPlatform.emulatorAvailable buildPackages) (
    let
      emulator = stdenv.hostPlatform.emulator buildPackages;
    in
    ''
      installShellCompletion --cmd ty \
        --bash <(${emulator} $out/bin/ty generate-shell-completion bash) \
        --fish <(${emulator} $out/bin/ty generate-shell-completion fish) \
        --zsh <(${emulator} $out/bin/ty generate-shell-completion zsh)
    ''
  );

  passthru = {
    updateScript = nix-update-script { extraArgs = [ "--version=unstable" ]; };
  };

  meta = {
    description = "Extremely fast Python type checker and language server, written in Rust";
    homepage = "https://github.com/astral-sh/ty";
    changelog = "https://github.com/astral-sh/ty/blob/main/CHANGELOG.md";
    license = lib.licenses.mit;
    mainProgram = "ty";
    maintainers = with lib.maintainers; [
      bengsparks
      GaetanLepage
    ];
  };
})
