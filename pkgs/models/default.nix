{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-27";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "ddd8d5b2d5c8394d6c30ca21fe92eb8b71614ec1";
    hash = "sha256-XJLD///wlOH2cmIqujD0WTT7wun8a+G763I7eG9Hc2I=";
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
