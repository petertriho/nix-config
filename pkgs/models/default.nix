{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-25";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "d9afa272937e417b6475640af5b362d44724e574";
    hash = "sha256-e//fjw+bmJnHyr6T8GcrgZRwwEp/Hc/y+BD6jMDKiyc=";
  };

  cargoHash = "sha256-ArIFhwf8+pTP7VzgCDAjtOJjRtVDOqSEjArvMW1ZR1s=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
