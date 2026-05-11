{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-10";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "3e52b00c75e45f68fed17ed2da28b2403de958c5";
    hash = "sha256-W2lMlTdDy2UiqfVcBoUIL+tbhyzvrJJx43LoNOLfmyw=";
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
