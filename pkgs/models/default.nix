{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-14";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "3102df9c72316bb3c8ebcf13fce22dd0b3bd29b1";
    hash = "sha256-pL7YGoYFKVkhwfJxtTw6salYESNGkM0TIES+ziwAfN4=";
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
