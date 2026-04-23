{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-23";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "0b0dd1fdab28f9071c30b8b0c2562f954d08a12c";
    hash = "sha256-pqa88nDBYRZDaOSvOrNj/9aHXIxPjXhYG89ET1RStxQ=";
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
