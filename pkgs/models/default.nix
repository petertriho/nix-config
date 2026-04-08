{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-08";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "592fbdc7d35b799163da48704270e77a52d9fa9c";
    hash = "sha256-OTNKG08Pquc0RqC6nOISkJ2X7dVvaikZNUqCEPzyf4c=";
  };

  cargoHash = "sha256-qAomuqDkcj/t4LVaRGIeX1+j6MEgv1rSH3JtCTHm2As=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
