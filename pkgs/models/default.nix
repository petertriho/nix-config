{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-30";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "57e20870e19eb00235db58a8abd43ce9adbba27f";
    hash = "sha256-ODDxb5h93cX+5i4fSk72M2u34AsEILbU08mWp/+2wvA=";
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
