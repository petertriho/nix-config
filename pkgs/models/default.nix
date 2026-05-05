{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-05-05";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "b6db6ae74503e3c64bfe74298289d00f53e00e4d";
    hash = "sha256-xemiW1jE6rJ4GjxCSRcZbSTCz+3YOVJ2I9GFvAM/xdY=";
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
