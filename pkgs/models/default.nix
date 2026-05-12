{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-12";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "8da29c64169dc2a284cef4934b0ad9c21366f44f";
    hash = "sha256-Sv7lkPlnT0h+g9acn5SjE7HG6EYNJh711UOWl5dlpRM=";
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
