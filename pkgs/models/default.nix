{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-24";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "e16896249bf4470f245c9840abf0e6bc2073fc70";
    hash = "sha256-fy8OcMu0lRMjEdm8tgWWNwwgb8cs3Rmr7bKIHdg2oN0=";
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
