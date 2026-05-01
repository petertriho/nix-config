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
    rev = "70d992a1c6c41c52f52b96f769b9507c8c0b5cf7";
    hash = "sha256-ZPa80EV+QDt8Ws98UhsvM9vbT3+5yOIdE/ljKioBWG4=";
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
