{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-07";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "980451deed508f7afcaee8d4e15fc07875dd382e";
    hash = "sha256-85i0q3+CuGiHrTTfixR+V/VrdX7m7BhH5CvtxJND8Jw=";
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
