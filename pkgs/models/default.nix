{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-26";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "3705a5444045f33378dfbc9859f278103e470e29";
    hash = "sha256-/N4uP530LQkpCy6l7SlfNnAX+pxKj1NaTz6iPkcK31U=";
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
