{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-09";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "1b03ac2b78f018cc3eb5ff8ee72ba868f0f374f8";
    hash = "sha256-Dk57U953SqdHjfr+7T1sUO0ydD/MVct6MWW0ZHv1yHE=";
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
