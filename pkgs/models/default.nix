{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-31";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "86ea014b5b0f156e3510286216d07504ed460a8a";
    hash = "sha256-L6D5ZTLz86x2NHlzTty8O0EDwtSi7HyzGxEWmEhx17A=";
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
