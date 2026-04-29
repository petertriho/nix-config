{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-29";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "237c400c7a0df24984f9f9f29bc6ab5b931a1d39";
    hash = "sha256-53NTnXYx+ZK9pa7YfNUmLUvNOwL9Ys6NB/0RUKQbWBA=";
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
