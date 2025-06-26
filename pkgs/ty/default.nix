{
  lib,
  stdenv,
  rustPlatform,
  fetchFromGitHub,
  # nativeBuildInputs
  installShellFiles,
  buildPackages,
  # versionCheckHook,
  python3Packages,
  nix-update-script,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "ty";
  version = "unstable-2025-06-25";

  src = fetchFromGitHub {
    owner = "astral-sh";
    repo = "ty";
    rev = "43e323e909e14de4948866bce8816d3d7e3d60d8";
    fetchSubmodules = true;
    sha256 = "11s6q4smqbhn4ighcx3p4xl5n76r7m4x3djgjdkz87h98mdirxhh";
  };

  cargoRoot = "ruff";
  buildAndTestSubdir = finalAttrs.cargoRoot;

  cargoBuildFlags = [ "--package=ty" ];

  useFetchCargoVendor = true;
  cargoHash = "sha256-T2JQqFRoMU0xbD8D4tqXdxTN1RxcK6u5DYR9uO876xs=";

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
    "--package=ty" # CLI and file-watching
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
    tests.ty-python = python3Packages.ty;
    updateScript = nix-update-script { };
  };

  meta = {
    description = "Extremely fast Python type checker and language server, written in Rust";
    homepage = "https://github.com/astral-sh/ty";
    changelog = "https://github.com/astral-sh/ty/blob/main/CHANGELOG.md";
    license = [ lib.licenses.mit ];
    mainProgram = "ty";
    maintainers = [ lib.maintainers.bengsparks ];
  };
})
