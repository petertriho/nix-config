{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.3-unstable-2026-03-26";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "0780006c5d9b87d112e884db3c1c3c2c2e0fb671";
    hash = "sha256-5z/il4eum3EQJC9SlEkAB8SJmLRq7LFbOFRIcPCpyEg=";
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
