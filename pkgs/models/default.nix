{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-15";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "71c36c681fdb0be5ced82dfac645b3a1e49bf4bf";
    hash = "sha256-iLMmIfxsMrDTHobBNbMKAlyct+RnUwfA7sS1m/vdQ+s=";
  };

  cargoLock.lockFileContents = builtins.readFile "${src}/Cargo.lock";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
