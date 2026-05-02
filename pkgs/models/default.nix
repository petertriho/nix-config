{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-05-02";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "323b9d5b87bb1ac5e0a858fdd11a2f5d0d364d63";
    hash = "sha256-3oRmn0xUK5HVtmZlC2AiustR65YmVafTf95LrQ5/gYU=";
  };

  cargoLock.lockFileContents = builtins.readFile "${src}/Cargo.lock";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
