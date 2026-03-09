{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.0-unstable-2026-03-09";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "2b03a9ddda6df67dba149aadc64ac64cfe9d14ab";
    hash = "sha256-E5FUyJD+2q9w2WMd8w6BMqyGi6yymIjnHmOfXPH14CI=";
  };

  cargoHash = "sha256-oaRi6xqNQ6NsBEqzsoGuuSCz4OY1ETu96vnJE7X8S3A=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
