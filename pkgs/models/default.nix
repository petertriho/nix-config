{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-24";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "91ac68a5a202e330b4cc1b34759c1673016801ce";
    hash = "sha256-qnXoUONynozsdJV2YKyVSjoHg4PZB7aHeE2A63as76k=";
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
