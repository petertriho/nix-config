{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-28";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "4b9f36e4770f6686301b2a2cbedac437434e5d29";
    hash = "sha256-Qe3Zvecsujlq9elg+UJ9mw/s5G1H9acowXihF1iXSCo=";
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
