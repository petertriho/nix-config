{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-05-01";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "6e7b2f9dfd2c6a3b11648b0edcf8e79b6af46df9";
    hash = "sha256-ylzbcNrWpUP4JPEPs5t57UdSJzETKeUYwmN73IfWQks=";
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
