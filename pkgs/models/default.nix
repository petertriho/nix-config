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
    rev = "0d8a603156c9cd9854c1bc7aa47d0f6aa7e884ef";
    hash = "sha256-jh0QBdm/B0rDNmehpabUJVOAN+zN6427o0upcjMNHMs=";
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
