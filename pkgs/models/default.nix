{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-08";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "474cc781399b72b5c822ce8300de6af3b466d74a";
    hash = "sha256-gTNGRFZNUvdjSvQmJAkM3vKth4NK/2YoRX2sHQBAoRM=";
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
