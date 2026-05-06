{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-05-06";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "f8095a3fa3c9482358b77e4e289e74fd9cdc9aac";
    hash = "sha256-Xq6iS5Ln5Q1kyKDn6W6BIGGJqnQ8WVnuFPKnX+aF+/I=";
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
